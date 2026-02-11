import { useEffect, useMemo, useState } from "react";
import { useActiveAccount, useActiveWalletChain, useActiveWalletConnectionStatus } from "thirdweb/react";
import { ethers } from "ethers";
import {  getReadContract,
  getWriteContract,
  TARGET_CHAIN_ID,
  withReadRetry,
} from "../lib/contract";
import { Phase, formatPhaseWindow, getPhaseStatus } from "../lib/phases";
import WalletMenu from "../components/WalletMenu";

const NETWORK_NAME = process.env.NEXT_PUBLIC_NETWORK_NAME || "Ethereum";
const NATIVE_SYMBOL = process.env.NEXT_PUBLIC_NATIVE_SYMBOL || "ETH";
const ENABLE_MINTERS = process.env.NEXT_PUBLIC_ENABLE_MINTERS === "true";
const MINTERS_LOOKBACK_BLOCKS = Number(process.env.NEXT_PUBLIC_MINTERS_LOOKBACK_BLOCKS || 50000);
const STATS_REFRESH_MS = Math.max(15000, Number(process.env.NEXT_PUBLIC_STATS_REFRESH_MS || 45000));
const PHASES_REFRESH_MS = Math.max(20000, Number(process.env.NEXT_PUBLIC_PHASES_REFRESH_MS || 120000));
const REFRESH_JITTER_MS = Math.max(0, Number(process.env.NEXT_PUBLIC_REFRESH_JITTER_MS || 5000));
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
  const [revealed, setRevealed] = useState(false);
  const [notRevealedURI, setNotRevealedURI] = useState("");
  const [hiddenMediaLoaded, setHiddenMediaLoaded] = useState(false);
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

  const isSupportedChain = !chain || SUPPORTED_CHAIN_IDS.includes(chain.id);
  const isTargetChain = TARGET_CHAIN_ID ? !!chain && chain.id === TARGET_CHAIN_ID : true;
  const isCorrectChain = isSupportedChain && isTargetChain;

  const refresh = async () => {
    try {
      const contract = getReadContract();
      const [price, total, max, maxPerWallet, isPaused, locked, fee, isRevealed, hiddenUri] =
        await withReadRetry(() =>
          Promise.all([
            contract.mintPrice(),
            contract.totalSupply(),
            contract.maxSupply(),
            contract.maxMintPerWallet(),
            contract.paused(),
            contract.transfersLocked(),
            contract.launchpadFee(),
            contract.revealed(),
            contract.notRevealedURI(),
          ])
        );

      setMintPrice(ethers.utils.formatEther(price));
      setTotalSupply(total.toString());
      setMaxSupply(max.toString());
      setMaxMintPerWallet(maxPerWallet.toString());
      setPaused(isPaused);
      setTransfersLocked(locked);
      setLaunchpadFee(ethers.utils.formatEther(fee));
      setRevealed(Boolean(isRevealed));
      setNotRevealedURI(hiddenUri || "");
    } catch (error: any) {
      setStatus({ type: "error", message: error?.message || "Failed to load" });
    }
  };

  const refreshMinters = async () => {
    try {
      setMintersLoading(true);
      setMintersError("");
      setMintersNotice("");
      if (!ENABLE_MINTERS) {
        setMinters([]);
        setMintersNotice("Minter list is disabled to reduce RPC load.");
        return;
      }
      const contract = getReadContract();
      const supply = await withReadRetry<any>(() => contract.totalSupply());
      if (supply.toString() === "0") {
        setMinters([]);
        return;
      }
      try {
        const filter = contract.filters.Transfer(ethers.constants.AddressZero, null);
        const provider = contract.provider;
        const latestBlock = await withReadRetry<number>(() => provider.getBlockNumber());
        const envDeployBlock = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || "");
        const lookback = Number.isFinite(MINTERS_LOOKBACK_BLOCKS) && MINTERS_LOOKBACK_BLOCKS > 0
          ? MINTERS_LOOKBACK_BLOCKS
          : 50000;
        const minBlock = Math.max(latestBlock - lookback, 0);
        const fromBlock = Number.isFinite(envDeployBlock) && envDeployBlock > 0
          ? Math.max(envDeployBlock, minBlock)
          : minBlock;
        if (!(Number.isFinite(envDeployBlock) && envDeployBlock > 0)) {
          setMintersNotice(
            "Using recent blocks only. Set NEXT_PUBLIC_DEPLOY_BLOCK for full mint history."
          );
        }
        const step = 2000;
        let events: any[] = [];
        for (let start = fromBlock; start <= latestBlock; start += step) {
          const end = Math.min(start + step - 1, latestBlock);
          const chunk = await withReadRetry(() => contract.queryFilter(filter, start, end));
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
        setMinters([]);
        setMintersError(logError?.message || "Failed to load mint events");
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
      const count = await withReadRetry<any>(() => contract.phaseCount());
      const items = await Promise.all(
        Array.from({ length: Number(count) }).map(async (_, index) => {
          const phase = await withReadRetry<any>(() => contract.phases(index));
          const exists = phase.exists ?? phase[5];
          if (!exists) return null;
          const [allowlist, root] = await withReadRetry(() =>
            Promise.all([contract.phaseAllowlistEnabled(index), contract.phaseMerkleRoot(index)])
          );
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
    if (ENABLE_MINTERS) {
      refreshMinters();
    } else {
      setMintersNotice("Minter list is disabled to reduce RPC load.");
    }
    refreshPhases();
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let stopped = false;
    let statsTimer: number | null = null;
    let phasesTimer: number | null = null;

    const nextDelay = (baseMs: number) => baseMs + Math.floor(Math.random() * REFRESH_JITTER_MS);

    const scheduleStats = () => {
      statsTimer = window.setTimeout(async () => {
        if (!stopped) {
          if (!document.hidden) {
            await refresh();
          }
          scheduleStats();
        }
      }, nextDelay(STATS_REFRESH_MS));
    };

    const schedulePhases = () => {
      phasesTimer = window.setTimeout(async () => {
        if (!stopped) {
          if (!document.hidden) {
            await refreshPhases();
          }
          schedulePhases();
        }
      }, nextDelay(PHASES_REFRESH_MS));
    };

    const handleFocus = () => {
      void refresh();
      void refreshPhases();
    };

    scheduleStats();
    schedulePhases();
    window.addEventListener("focus", handleFocus);

    return () => {
      stopped = true;
      if (statsTimer !== null) {
        window.clearTimeout(statsTimer);
      }
      if (phasesTimer !== null) {
        window.clearTimeout(phasesTimer);
      }
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
      if (ENABLE_MINTERS) {
        await Promise.all([refresh(), refreshMinters()]);
      } else {
        await refresh();
      }
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
  const timeZoneLabel = "Local time";
  const resolveMedia = (uri: string) => {
    if (!uri) return uri;
    if (uri.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
    }
    return uri;
  };
  const previewSrc = resolveMedia(notRevealedURI || "");
  const showRevealPreview = Boolean(previewSrc);

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
        const allowed = await withReadRetry<any>(() => contract.phaseAllowlist(activePhase.id, address));
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

  useEffect(() => {
    if (!showRevealPreview) {
      setHiddenMediaLoaded(false);
    }
  }, [showRevealPreview, previewSrc]);

  if (!mounted) {
    return <div className="min-h-screen bg-hero text-white" />;
  }

  return (
    <div className="min-h-screen bg-hero text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="launch-header">
          <div className="launch-left">
            <div className="brand-mark">
              <span className="brand-wordmark">Lapinoz</span>
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
          <span className={`info-pill ${phaseLive && !paused ? "info-pill-live" : "info-pill-muted"}`}>
            {paused ? "Paused" : phaseLive ? "Minting Now" : "Mint Closed"}
          </span>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className="preview-card">
              <div className="preview-image">
                {showRevealPreview ? (
                  <img
                    src={previewSrc}
                    alt="Lapinoz reveal preview"
                    className={`preview-media ${hiddenMediaLoaded ? "is-loaded" : ""}`}
                    onLoad={() => setHiddenMediaLoaded(true)}
                  />
                ) : (
                  <div className="preview-empty">Set Reveal Image URI from Admin.</div>
                )}
              </div>
              <div className="preview-caption">Reveal Preview</div>
            </div>

            <div className="glass-card">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Minted Wallets</h3>
                <span className="text-xs text-slate-400">
                  {minters.length} wallet{minters.length === 1 ? "" : "s"}
                </span>
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
