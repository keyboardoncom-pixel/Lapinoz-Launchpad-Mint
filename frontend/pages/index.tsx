import { useEffect, useMemo, useState } from "react";
import { useActiveAccount, useActiveWalletChain, useActiveWalletConnectionStatus } from "thirdweb/react";
import { ethers } from "ethers";
import {
  formatAddress,
  getReadContract,
  getWriteContract,
  TARGET_CHAIN_ID,
} from "../lib/contract";
import { Phase, formatPhaseWindow, getPhaseStatus } from "../lib/phases";
import WalletMenu from "../components/WalletMenu";

const NETWORK_NAME = process.env.NEXT_PUBLIC_NETWORK_NAME || "Ethereum";
const NATIVE_SYMBOL = process.env.NEXT_PUBLIC_NATIVE_SYMBOL || "ETH";
const FALLBACK_SUPPORTED_CHAIN_IDS = [1, 11155111, 5, 137];
const SUPPORTED_CHAIN_IDS = TARGET_CHAIN_ID
  ? [TARGET_CHAIN_ID]
  : FALLBACK_SUPPORTED_CHAIN_IDS;

type TxStatus = {
  type: "pending" | "success" | "error" | "idle";
  message: string;
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const connectionStatus = useActiveWalletConnectionStatus();
  const address = account?.address;
  const isConnected = connectionStatus === "connected" && !!address;

  const [mintPrice, setMintPrice] = useState("0");
  const [totalSupply, setTotalSupply] = useState("0");
  const [maxSupply, setMaxSupply] = useState("0");
  const [maxMintPerWallet, setMaxMintPerWallet] = useState("0");
  const [launchpadFee, setLaunchpadFee] = useState("0");
  const [paused, setPaused] = useState(false);
  const [transfersLocked, setTransfersLocked] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<TxStatus>({ type: "idle", message: "" });
  const [minters, setMinters] = useState<{ address: string; count: number }[]>([]);
  const [mintersLoading, setMintersLoading] = useState(false);
  const [mintersError, setMintersError] = useState("");
  const [mintersNotice, setMintersNotice] = useState("");
  const [showEligibility, setShowEligibility] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [allowlistEligible, setAllowlistEligible] = useState<boolean | null>(null);

  const previewImages = useMemo(
    () => [
      { id: 1, src: "/preview/sample-1.png" },
      { id: 2, src: "/preview/sample-2.png" },
      { id: 3, src: "/preview/sample-3.png" },
      { id: 4, src: "/preview/sample-4.png" },
      { id: 5, src: "/preview/sample-5.png" },
    ],
    []
  );
  const [previewId, setPreviewId] = useState(1);

  const isSupportedChain = !chain || SUPPORTED_CHAIN_IDS.includes(chain.id);
  const isTargetChain = TARGET_CHAIN_ID ? !!chain && chain.id === TARGET_CHAIN_ID : true;
  const isCorrectChain = isSupportedChain && isTargetChain;

  const refresh = async () => {
    try {
      const contract = getReadContract();
      const [price, total, max, maxPerWallet, isPaused, locked, fee] =
        await Promise.all([
          contract.mintPrice(),
          contract.totalSupply(),
          contract.maxSupply(),
          contract.maxMintPerWallet(),
          contract.paused(),
          contract.transfersLocked(),
          contract.launchpadFee(),
        ]);

      setMintPrice(ethers.utils.formatEther(price));
      setTotalSupply(total.toString());
      setMaxSupply(max.toString());
      setMaxMintPerWallet(maxPerWallet.toString());
      setPaused(isPaused);
      setTransfersLocked(locked);
      setLaunchpadFee(ethers.utils.formatEther(fee));
    } catch (error: any) {
      setStatus({ type: "error", message: error?.message || "Failed to load" });
    }
  };

  const refreshMinters = async () => {
    try {
      setMintersLoading(true);
      setMintersError("");
      setMintersNotice("");
      const contract = getReadContract();
      const supply = await contract.totalSupply();
      if (supply.toString() === "0") {
        setMinters([]);
        return;
      }
      try {
        const filter = contract.filters.Transfer(ethers.constants.AddressZero, null);
        const provider = contract.provider;
        const latestBlock = await provider.getBlockNumber();
        const envDeployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || "");
        const fallbackSpan = 100000;
        const fromBlock = Number.isFinite(envDeployBlock) && envDeployBlock > 0
          ? envDeployBlock
          : Math.max(latestBlock - fallbackSpan, 0);
        const step = 1000;
        let events: any[] = [];
        for (let start = fromBlock; start <= latestBlock; start += step) {
          const end = Math.min(start + step - 1, latestBlock);
          const chunk = await contract.queryFilter(filter, start, end);
          events = events.concat(chunk);
        }
        const counts = new Map<string, number>();
        for (const event of events) {
          const to = (event.args?.to as string) || "";
          if (!to) continue;
          counts.set(to, (counts.get(to) || 0) + 1);
        }
        const list = Array.from(counts.entries()).map(([address, count]) => ({
          address,
          count,
        }));
        list.sort((a, b) => b.count - a.count);
        setMinters(list);
        return;
      } catch (logError: any) {
        // fall back to ownerOf scan if log query is rate-limited
        const total = Number(supply.toString());
        const counts = new Map<string, number>();
        const batchSize = 20;
        for (let start = 1; start <= total; start += batchSize) {
          const ids = Array.from(
            { length: Math.min(batchSize, total - start + 1) },
            (_, index) => start + index
          );
          const owners = await Promise.all(
            ids.map(async (tokenId) => {
              try {
                return await contract.ownerOf(tokenId);
              } catch {
                return null;
              }
            })
          );
          for (const owner of owners) {
            if (!owner) continue;
            counts.set(owner, (counts.get(owner) || 0) + 1);
          }
        }
        const list = Array.from(counts.entries()).map(([address, count]) => ({
          address,
          count,
        }));
        list.sort((a, b) => b.count - a.count);
        setMinters(list);
        setMintersNotice(
          "RPC log limit hit. Showing current holders instead of mint events."
        );
      }
    } catch (error: any) {
      setMintersError(error?.message || "Failed to load minters");
    } finally {
      setMintersLoading(false);
    }
  };

  const refreshPhases = async () => {
    try {
      const contract = getReadContract();
      const count = await contract.phaseCount();
      const items = await Promise.all(
        Array.from({ length: Number(count) }).map(async (_, index) => {
          const phase = await contract.phases(index);
          const exists = phase.exists ?? phase[5];
          if (!exists) return null;
          const allowlist = await contract.phaseAllowlistEnabled(index);
          const root = await contract.phaseMerkleRoot(index);
          return {
            id: index,
            name: phase.name,
            priceEth: ethers.utils.formatEther(phase.price),
            limitPerWallet: Number(phase.maxPerWallet?.toString?.() || phase.maxPerWallet),
            startsAt: Number(phase.startTime),
            endsAt: Number(phase.endTime),
            allowlistEnabled: Boolean(allowlist),
            allowlistRoot: root,
          } as Phase;
        })
      );
      setPhases(items.filter(Boolean) as Phase[]);
    } catch {
      setPhases([]);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    refresh();
    refreshMinters();
    refreshPhases();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const handleFocus = () => {
      refresh();
      refreshPhases();
    };
    const interval = window.setInterval(() => {
      refresh();
      refreshPhases();
    }, 15000);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [mounted]);

  const fetchAllowlistProof = async (phaseId: number, wallet: string) => {
    try {
      const res = await fetch(`/allowlists/phase-${phaseId}.json`, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      const proof = data?.proofs?.[wallet.toLowerCase()];
      return Array.isArray(proof) ? proof : [];
    } catch {
      return [];
    }
  };

  const handleMint = async () => {
    if (!isConnected) {
      setStatus({ type: "error", message: "Connect a wallet first" });
      return;
    }
    if (!isSupportedChain) {
      setStatus({ type: "error", message: `Switch to ${NETWORK_NAME} network` });
      return;
    }
    if (!isTargetChain) {
      setStatus({ type: "error", message: `Switch to ${NETWORK_NAME} network` });
      return;
    }

    try {
      setStatus({ type: "pending", message: "Waiting for wallet confirmation" });
      const contract = await getWriteContract(account, chain);
      const [active, phaseId, , price] = await contract.getActivePhase();
      const fee = await contract.launchpadFee();
      if (!active) {
        setStatus({ type: "error", message: "No active phase available" });
        return;
      }
      const allowlistEnabled = await contract.phaseAllowlistEnabled(phaseId);
      let proof: string[] = [];
      if (allowlistEnabled) {
        if (!address) {
          setStatus({ type: "error", message: "Connect a wallet to check allowlist" });
          return;
        }
        const allowed = await contract.phaseAllowlist(phaseId, address);
        if (!allowed) {
          proof = await fetchAllowlistProof(phaseId, address);
          if (!proof.length) {
            setStatus({ type: "error", message: "Wallet is not allowlisted for this phase" });
            return;
          }
        }
      }
      const totalValue = price.mul(quantity).add(fee.mul(quantity));
      const tx = await contract.publicMint(quantity, proof, { value: totalValue });
      setStatus({ type: "pending", message: "Transaction submitted" });
      await tx.wait();
      setStatus({ type: "success", message: "Mint successful" });
      await Promise.all([refresh(), refreshMinters()]);
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.reason || error?.message || "Mint failed",
      });
    }
  };


  const maxSupplyNumber = Number(maxSupply) || 0;
  const totalSupplyNumber = Number(totalSupply) || 0;
  const progress = maxSupplyNumber > 0 ? (totalSupplyNumber / maxSupplyNumber) * 100 : 0;
  const derivedPhases = phases;
  const activePhase =
    derivedPhases.find((phase) => getPhaseStatus(phase) === "live") || derivedPhases[0];
  const phaseLive = activePhase ? getPhaseStatus(activePhase) === "live" : false;
  const allowlistRequired = Boolean(activePhase?.allowlistEnabled);
  const allowlistOk = !allowlistRequired || Boolean(allowlistEligible);
  const canMint = useMemo(() => {
    return isConnected && isCorrectChain && phaseLive && !paused && allowlistOk;
  }, [isConnected, isCorrectChain, phaseLive, paused, allowlistOk]);
  const totalCost = useMemo(() => {
    try {
      const priceWei = ethers.utils.parseEther(activePhase?.priceEth ?? mintPrice ?? "0");
      const feeWei = ethers.utils.parseEther(launchpadFee || "0");
      const totalWei = priceWei.add(feeWei).mul(quantity);
      return ethers.utils.formatEther(totalWei);
    } catch {
      return "0";
    }
  }, [activePhase?.priceEth, mintPrice, launchpadFee, quantity]);
  const timeZoneLabel = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(
        new Date()
      );
      const tz = parts.find((part) => part.type === "timeZoneName")?.value;
      return tz ? `Local time (${tz})` : "Local time";
    } catch {
      return "Local time";
    }
  }, []);
  const activePreview =
    previewImages.find((preview) => preview.id === previewId) || previewImages[0];

  useEffect(() => {
    if (!mounted) return;
    const loadEligibility = async () => {
      if (!address || !activePhase) {
        setAllowlistEligible(null);
        return;
      }
      if (!activePhase.allowlistEnabled) {
        setAllowlistEligible(true);
        return;
      }
      try {
        const contract = getReadContract();
        const allowed = await contract.phaseAllowlist(activePhase.id, address);
        if (allowed) {
          setAllowlistEligible(true);
          return;
        }
        if (activePhase.allowlistRoot && activePhase.allowlistRoot !== ethers.constants.HashZero) {
          const proof = await fetchAllowlistProof(activePhase.id, address);
          setAllowlistEligible(proof.length > 0);
          return;
        }
        setAllowlistEligible(false);
      } catch {
        setAllowlistEligible(null);
      }
    };
    loadEligibility();
  }, [mounted, address, activePhase?.id, activePhase?.allowlistEnabled, activePhase?.allowlistRoot]);

  if (!mounted) {
    return <div className="min-h-screen bg-hero text-white" />;
  }

  return (
    <div className="min-h-screen bg-hero text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="launch-header">
          <div className="launch-left">
            <div className="brand-mark">
              <img src="/icons/logo.png" alt="Chill Guins" className="brand-logo" />
            </div>
          </div>
          <div className="launch-right">
            <WalletMenu onStatus={setStatus} />
          </div>
        </header>

        <div className="mint-info-bar">
          <span className="info-pill">{NETWORK_NAME}</span>
          <span className="info-pill">
            {totalSupply} / {maxSupply} Minted
          </span>
          <span className="info-pill">Launched Feb 2026</span>
          <span className="info-pill">Art</span>
          <span className={`info-pill ${phaseLive && !paused ? "info-pill-live" : "info-pill-muted"}`}>
            {paused ? "Paused" : phaseLive ? "Minting Now" : "Mint Closed"}
          </span>
          <span className={`info-pill info-pill-freeze ${transfersLocked ? "is-on" : "is-off"}`}>
            <img className="info-pill-icon" src="/icons/snowflake.png" alt="" />
            Freeze Collection {transfersLocked ? "On" : "Off"}
          </span>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className="preview-card">
              <div className="preview-image">
                <img
                  src={activePreview.src}
                  alt={`Chill Guins preview ${activePreview.id}`}
                />
              </div>
              <div className="preview-caption">Preview #{activePreview.id}</div>
              <div className="preview-thumbs">
                {previewImages.map((preview) => (
                  <button
                    key={preview.id}
                    type="button"
                    className={`preview-thumb ${
                      preview.id === activePreview.id ? "is-active" : ""
                    }`}
                    onClick={() => setPreviewId(preview.id)}
                  >
                    <img src={preview.src} alt={`Preview ${preview.id}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Minted Wallets</h3>
                <span className="text-xs text-slate-400">
                  {minters.length} wallet{minters.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-4">
                {mintersLoading ? (
                  <p className="text-sm text-slate-400">Loading wallets...</p>
                ) : mintersError ? (
                  <p className="text-sm text-red-300">{mintersError}</p>
                ) : mintersNotice ? (
                  <p className="text-sm text-slate-400">{mintersNotice}</p>
                ) : minters.length === 0 ? (
                  <p className="text-sm text-slate-400">No mints yet.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1 text-sm text-slate-300">
                    {minters.map((minter) => (
                      <div
                        key={minter.address}
                        className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2"
                      >
                        <span className="font-mono text-xs text-slate-200" title={minter.address}>
                          {formatAddress(minter.address)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {minter.count} mint{minter.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-card">
              <div className="mint-progress">
                <div className="mint-progress-header">
                  <span>Items minted</span>
                  <span>
                    {totalSupply} / {maxSupply}
                  </span>
                </div>
                <div className="mint-progress-bar">
                  <div className="mint-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="phase-card">
                <div className="phase-meta">
                  <div className="phase-title">
                    <p className="phase-label">{activePhase?.name || "No active phase"}</p>
                    <span
                      className={`phase-chip ${
                        phaseLive && !paused ? "phase-chip-live" : "phase-chip-closed"
                      }`}
                    >
                      {paused ? "Paused" : phaseLive ? "Minting now" : "Closed"}
                    </span>
                  </div>
                  <p className="phase-price">
                    {activePhase ? `${activePhase.priceEth} ${NATIVE_SYMBOL}` : `0.0 ${NATIVE_SYMBOL}`}
                  </p>
                  <div className="phase-subtext">
                    <span className={`phase-dot ${phaseLive && !paused ? "phase-dot-live" : ""}`} />
                    <span>
                      {activePhase
                        ? paused
                          ? "Paused"
                          : phaseLive
                          ? "Minting now"
                          : "Not live"
                        : "No phases configured"}
                    </span>
                  </div>
                  {activePhase ? (
                    <div
                      className={`allowlist-banner ${
                        allowlistRequired
                          ? allowlistOk
                            ? "allowlist-yes"
                            : "allowlist-no"
                          : "allowlist-open"
                      }`}
                    >
                      {allowlistRequired
                        ? !isConnected
                          ? "Allowlist required — connect wallet to check."
                          : allowlistEligible === null
                          ? "Checking allowlist eligibility..."
                          : allowlistOk
                          ? "Allowlist eligible."
                          : "Not eligible for this phase."
                        : "Public phase — no allowlist required."}
                    </div>
                  ) : null}
                </div>
                <div className="phase-actions">
                  <div className="qty-control">
                    <button
                      className="qty-btn"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      -
                    </button>
                    <span className="qty-value">{quantity}</span>
                    <button className="qty-btn" onClick={() => setQuantity((q) => q + 1)}>
                      +
                    </button>
                  </div>
                  <button
                    className={`mint-cta ${canMint ? "mint-cta-live" : ""}`}
                    onClick={handleMint}
                    disabled={!canMint}
                  >
                    Mint
                  </button>
                  <span className="phase-limit">
                    Limit {activePhase ? activePhase.limitPerWallet : "-"} per wallet
                  </span>
                </div>
              </div>

              <div className="phase-summary">
                <div className="summary-item">
                  <span>Total cost</span>
                  <span className="text-white">{totalCost} {NATIVE_SYMBOL}</span>
                </div>
                <div className="summary-item">
                  <span>Launchpad fee</span>
                  <span className="text-white">{launchpadFee} {NATIVE_SYMBOL} / mint</span>
                </div>
                <div className="summary-item">
                  <span>Freeze collection</span>
                  <span className="text-white">{transfersLocked ? "On" : "Off"}</span>
                </div>
              </div>

              {!isSupportedChain && isConnected ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                  Wrong network. Switch to {NETWORK_NAME}.
                </div>
              ) : null}
              {isSupportedChain && !isTargetChain && isConnected ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                  Wrong network. Switch to {NETWORK_NAME} to use this launchpad.
                </div>
              ) : null}

              {status.message ? (
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    status.type === "success"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : status.type === "error"
                      ? "border-red-500/40 bg-red-500/10 text-red-200"
                      : "border-slate-700 bg-slate-800 text-slate-300"
                  }`}
                >
                  {status.message}
                </div>
              ) : null}
            </div>

            <div className="glass-card">
              <div className="schedule-header">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Mint Schedule</p>
                  <h3 className="text-lg font-semibold">Phase Overview</h3>
                  <p className="schedule-timezone">{timeZoneLabel}</p>
                </div>
                <button
                  className="schedule-button"
                  onClick={() => setShowEligibility((value) => !value)}
                >
                  {showEligibility ? "Hide eligibility" : "View eligibility"}
                </button>
              </div>
              {showEligibility ? (
                <div className="schedule-eligibility">
                  {!activePhase
                    ? "No phases configured yet."
                    : !isConnected
                    ? "Connect a wallet to check eligibility."
                    : activePhase.allowlistEnabled
                    ? allowlistEligible === null
                      ? "Checking allowlist status..."
                      : allowlistEligible
                      ? `Eligible for ${activePhase.name}.`
                      : `Not eligible for ${activePhase.name}.`
                    : "Public phase — everyone can mint."}
                </div>
              ) : null}
              <div className="schedule-list">
                {derivedPhases.length === 0 ? (
                  <div className="schedule-empty">No phases configured yet.</div>
                ) : (
                  derivedPhases.map((phase) => {
                    const status = getPhaseStatus(phase);
                    return (
                      <div
                        key={phase.id}
                        className={`schedule-item ${
                          status === "live"
                            ? "schedule-item-live"
                            : status === "upcoming"
                            ? "schedule-item-upcoming"
                            : status === "ended"
                            ? "schedule-item-ended"
                            : ""
                        }`}
                      >
                        <span className="schedule-dot">
                          {status === "live" ? "✓" : status === "upcoming" ? "•" : status === "ended" ? "—" : "•"}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="schedule-title">{phase.name}</p>
                            <span className={`schedule-status schedule-status-${status}`}>
                              {status}
                            </span>
                            <span
                              className={`schedule-tag ${
                                phase.allowlistEnabled ? "schedule-tag-allowlist" : "schedule-tag-public"
                              }`}
                            >
                              {phase.allowlistEnabled ? "Allowlist" : "Public"}
                            </span>
                          </div>
                          <p className="schedule-meta">{formatPhaseWindow(phase)}</p>
                          <p className="schedule-meta">
                            {phase.priceEth} {NATIVE_SYMBOL} | limit {phase.limitPerWallet} per wallet
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="glass-card">
              <h3 className="text-lg font-semibold">Mint Steps</h3>
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <div className="flex items-center gap-3">
                  <span className="step-dot">1</span>
                  <span>Connect your wallet.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="step-dot">2</span>
                  <span>Choose quantity and confirm.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="step-dot">3</span>
                  <span>Track status and view your NFT.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
