import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useAccount, useNetwork } from "wagmi";
import {
  CONTRACT_ADDRESS,
  formatAddress,
  getReadContract,
  getWriteContract,
  isSameAddress,
  TARGET_CHAIN_ID,
} from "../lib/contract";
import WalletMenu from "../components/WalletMenu";
import { Phase, formatPhaseWindow, fromInputDateTime, getPhaseStatus, toInputDateTime } from "../lib/phases";

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

export default function Admin() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected, connector } = useAccount();
  const { chain } = useNetwork();

  const [owner, setOwner] = useState<string>("");
  const [baseURI, setBaseURI] = useState<string>("");
  const [mintPrice, setMintPrice] = useState("0");
  const [maxMintPerWallet, setMaxMintPerWallet] = useState("0");
  const [paused, setPaused] = useState(false);
  const [transfersLocked, setTransfersLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<TxStatus>({ type: "idle", message: "" });
  const [phases, setPhases] = useState<Phase[]>([]);
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [phaseForm, setPhaseForm] = useState({
    name: "",
    priceEth: "",
    limitPerWallet: "",
    startsAt: "",
    endsAt: "",
  });
  const [allowlistPhaseId, setAllowlistPhaseId] = useState<number | null>(null);
  const [allowlistEnabled, setAllowlistEnabled] = useState(false);
  const [allowlistWallets, setAllowlistWallets] = useState("");
  const [allowlistRoot, setAllowlistRoot] = useState("");

  const isSupportedChain = !chain || SUPPORTED_CHAIN_IDS.includes(chain.id);
  const isTargetChain = TARGET_CHAIN_ID ? !!chain && chain.id === TARGET_CHAIN_ID : true;
  const isCorrectChain = isSupportedChain && isTargetChain;

  const refresh = async () => {
    try {
      const contract = getReadContract();
      const [ownerAddress, isPaused, locked, isRevealed, currentBaseURI, price, maxPerWallet] =
        await Promise.all([
          contract.owner(),
          contract.paused(),
          contract.transfersLocked(),
          contract.revealed(),
          contract.baseURI(),
          contract.mintPrice(),
          contract.maxMintPerWallet(),
        ]);
      setOwner(ownerAddress);
      setPaused(isPaused);
      setTransfersLocked(locked);
      setRevealed(isRevealed);
      setBaseURI(currentBaseURI || "");
      setMintPrice(ethers.utils.formatEther(price));
      setMaxMintPerWallet(maxPerWallet.toString());
      if (status.type === "error") {
        setStatus({ type: "idle", message: "" });
      }
    } catch (error: any) {
      setStatus({ type: "error", message: error?.message || "Failed to load" });
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    refresh();
  }, []);

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
      const filtered = items.filter(Boolean) as Phase[];
      setPhases(filtered);
      if (filtered.length && allowlistPhaseId === null) {
        setAllowlistPhaseId(filtered[0].id);
      }
    } catch (error: any) {
      setStatus({ type: "error", message: error?.message || "Failed to load phases" });
    }
  };

  useEffect(() => {
    if (!mounted) return;
    refreshPhases();
  }, [mounted]);

  useEffect(() => {
    if (!phases.length) return;
    if (allowlistPhaseId === null) {
      setAllowlistPhaseId(phases[0].id);
      return;
    }
    const selected = phases.find((phase) => phase.id === allowlistPhaseId);
    if (!selected) {
      setAllowlistPhaseId(phases[0].id);
      return;
    }
    setAllowlistEnabled(Boolean(selected.allowlistEnabled));
    setAllowlistRoot(selected.allowlistRoot || "");
  }, [allowlistPhaseId, phases]);


  const isOwner = useMemo(() => {
    return isSameAddress(address, owner);
  }, [address, owner]);

  const canManage = isConnected && isOwner && isCorrectChain;
  const isBusy = status.type === "pending";

  const ensureReady = () => {
    if (!isConnected) {
      setStatus({ type: "error", message: "Connect a wallet first" });
      return false;
    }
    if (!isSupportedChain) {
      setStatus({ type: "error", message: `Switch to ${NETWORK_NAME} network` });
      return false;
    }
    if (!isTargetChain) {
      setStatus({ type: "error", message: `Switch to ${NETWORK_NAME} network` });
      return false;
    }
    if (!isOwner) {
      setStatus({ type: "error", message: "Owner wallet required" });
      return false;
    }
    return true;
  };

  const withTx = async (fn: () => Promise<void>) => {
    try {
      setStatus({ type: "pending", message: "Waiting for confirmation" });
      await fn();
      setStatus({ type: "success", message: "Transaction confirmed" });
      await refresh();
      await refreshPhases();
    } catch (error: any) {
      setStatus({
        type: "error",
        message: error?.reason || error?.message || "Transaction failed",
      });
    }
  };

  const handleSetBaseURI = async () => {
    if (!ensureReady()) return;
    if (!baseURI.trim()) {
      setStatus({ type: "error", message: "Base URI cannot be empty" });
      return;
    }
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = await contract.setBaseURI(baseURI.trim());
      await tx.wait();
    });
  };

  const handlePauseToggle = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = paused ? await contract.unpause() : await contract.pause();
      await tx.wait();
    });
  };

  const handleWithdraw = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = await contract.withdraw();
      await tx.wait();
    });
  };

  const handleToggleTransfers = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = await contract.setTransfersLocked(!transfersLocked);
      await tx.wait();
    });
  };

  const handleToggleReveal = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = await contract.setRevealed(!revealed);
      await tx.wait();
    });
  };


  const handleCopyContract = async () => {
    if (!CONTRACT_ADDRESS) return;
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setStatus({ type: "success", message: "Contract address copied" });
    } catch (error: any) {
      setStatus({ type: "error", message: "Failed to copy address" });
    }
  };

  const resetPhaseForm = () => {
    setEditingPhaseId(null);
    setPhaseForm({
      name: "",
      priceEth: "",
      limitPerWallet: "",
      startsAt: "",
      endsAt: "",
    });
  };

  const handleSavePhase = async () => {
    if (!ensureReady()) return;
    if (!phaseForm.name.trim()) {
      setStatus({ type: "error", message: "Phase name is required" });
      return;
    }
    const priceInput = phaseForm.priceEth.trim() || mintPrice || "0";
    const limitInput = Number(phaseForm.limitPerWallet || maxMintPerWallet || 0);
    if (!Number.isFinite(limitInput) || limitInput <= 0) {
      setStatus({ type: "error", message: "Limit per wallet must be greater than 0" });
      return;
    }
    const startTime = fromInputDateTime(phaseForm.startsAt);
    const endTime = fromInputDateTime(phaseForm.endsAt);
    if (endTime && startTime && endTime <= startTime) {
      setStatus({ type: "error", message: "End date must be after start date" });
      return;
    }
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const priceWei = ethers.utils.parseEther(priceInput);
      if (editingPhaseId !== null) {
        const tx = await contract.updatePhase(
          editingPhaseId,
          phaseForm.name.trim(),
          startTime,
          endTime,
          priceWei,
          limitInput
        );
        await tx.wait();
      } else {
        const tx = await contract.addPhase(
          phaseForm.name.trim(),
          startTime,
          endTime,
          priceWei,
          limitInput
        );
        await tx.wait();
      }
    });
    resetPhaseForm();
  };

  const handleEditPhase = (phase: Phase) => {
    setEditingPhaseId(phase.id);
    setPhaseForm({
      name: phase.name,
      priceEth: phase.priceEth,
      limitPerWallet: phase.limitPerWallet ? String(phase.limitPerWallet) : "",
      startsAt: toInputDateTime(phase.startsAt),
      endsAt: toInputDateTime(phase.endsAt),
    });
  };

  const handleDeletePhase = (phaseId: number) => {
    if (!ensureReady()) return;
    void (async () => {
      await withTx(async () => {
        const contract = await getWriteContract(connector);
        const tx = await contract.removePhase(phaseId);
        await tx.wait();
      });
      if (editingPhaseId === phaseId) {
        resetPhaseForm();
      }
    })();
  };

  const parseWallets = (input: string) => {
    const raw = input
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const unique = new Set<string>();
    for (const value of raw) {
      if (!ethers.utils.isAddress(value)) {
        throw new Error(`Invalid address: ${value}`);
      }
      unique.add(ethers.utils.getAddress(value));
    }
    return Array.from(unique);
  };

  const handleToggleAllowlist = async () => {
    if (!ensureReady()) return;
    if (allowlistPhaseId === null) {
      setStatus({ type: "error", message: "Select a phase first" });
      return;
    }
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = await contract.setPhaseAllowlistEnabled(allowlistPhaseId, !allowlistEnabled);
      await tx.wait();
    });
  };

  const handleAllowlistUpdate = async (allowed: boolean) => {
    if (!ensureReady()) return;
    if (allowlistPhaseId === null) {
      setStatus({ type: "error", message: "Select a phase first" });
      return;
    }
    let wallets: string[] = [];
    try {
      wallets = parseWallets(allowlistWallets);
    } catch (error: any) {
      setStatus({ type: "error", message: error?.message || "Invalid wallet list" });
      return;
    }
    if (wallets.length === 0) {
      setStatus({ type: "error", message: "Add at least one wallet address" });
      return;
    }
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = await contract.setPhaseAllowlist(allowlistPhaseId, wallets, allowed);
      await tx.wait();
    });
  };

  const handleSetAllowlistRoot = async () => {
    if (!ensureReady()) return;
    if (allowlistPhaseId === null) {
      setStatus({ type: "error", message: "Select a phase first" });
      return;
    }
    const rootValue = allowlistRoot.trim();
    const root = rootValue.length ? rootValue : ethers.constants.HashZero;
    if (root !== ethers.constants.HashZero && !ethers.utils.isHexString(root, 32)) {
      setStatus({ type: "error", message: "Merkle root must be a 32-byte hex string" });
      return;
    }
    await withTx(async () => {
      const contract = await getWriteContract(connector);
      const tx = await contract.setPhaseMerkleRoot(allowlistPhaseId, root);
      await tx.wait();
    });
  };

  if (!mounted) {
    return <div className="min-h-screen bg-hero text-white" />;
  }

  return (
    <div className="min-h-screen bg-hero text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Admin Console</p>
            <h1 className="text-3xl font-semibold sm:text-4xl">Chill Guins Control Room</h1>
            <p className="text-sm text-slate-300">
              Manage mint status, metadata, and treasury actions from the owner wallet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <WalletMenu onStatus={setStatus} />
          </div>
        </header>

        {!isSupportedChain && isConnected ? (
          <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            Wrong network. Switch to {NETWORK_NAME}.
          </div>
        ) : null}
        {isSupportedChain && !isTargetChain && isConnected ? (
          <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            Wrong network. Switch to {NETWORK_NAME} to manage this contract.
          </div>
        ) : null}

        {isConnected && !isOwner ? (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            Connected wallet is not the contract owner.
          </div>
        ) : null}

        {canManage ? (
          <>
            <div className="quick-bar">
              <div className="quick-bar-card">
                <div>
                  <p className="quick-bar-title">Pause Mint</p>
                  <p className="quick-bar-subtitle">Stop all minting activity</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={paused}
                  aria-label="Toggle pause"
                  disabled={isBusy}
                  onClick={handlePauseToggle}
                  className={`toggle ${paused ? "toggle-on" : ""}`}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
              <div className="quick-bar-card">
                <div>
                  <p className="quick-bar-title">Reveal Metadata</p>
                  <p className="quick-bar-subtitle">Show final metadata on-chain</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={revealed}
                  aria-label="Toggle reveal metadata"
                  disabled={isBusy}
                  onClick={handleToggleReveal}
                  className={`toggle ${revealed ? "toggle-on" : ""}`}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
              <div className="quick-bar-card">
                <div>
                  <p className="quick-bar-title">Freeze Collection</p>
                  <p className="quick-bar-subtitle">Block secondary transfers</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={transfersLocked}
                  aria-label="Toggle freeze collection"
                  disabled={isBusy}
                  onClick={handleToggleTransfers}
                  className={`toggle ${transfersLocked ? "toggle-on" : ""}`}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </div>

            <main className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="glass-card space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Collection Controls</p>
                <h2 className="text-2xl font-semibold">Mint Operations</h2>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-500">Base URI (IPFS)</label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white"
                    placeholder="ipfs://CID/"
                    value={baseURI}
                    onChange={(e) => setBaseURI(e.target.value)}
                  />
                  <button
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                    onClick={handleSetBaseURI}
                  >
                    Set Base URI
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Phase Manager</p>
                    <h3 className="text-lg font-semibold">Mint Phases</h3>
                  </div>
                  <button
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs uppercase tracking-[0.2em]"
                    onClick={resetPhaseForm}
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="phase-field">
                    <span className="phase-label">Phase name</span>
                    <input
                      className="phase-input"
                      value={phaseForm.name}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </label>
                  <label className="phase-field">
                    <span className="phase-label">Price {NATIVE_SYMBOL} (default {mintPrice})</span>
                    <input
                      className="phase-input"
                      type="number"
                      step="0.0001"
                      value={phaseForm.priceEth}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, priceEth: e.target.value }))}
                    />
                  </label>
                  <label className="phase-field">
                    <span className="phase-label">Limit per wallet (default {maxMintPerWallet})</span>
                    <input
                      className="phase-input"
                      type="number"
                      value={phaseForm.limitPerWallet}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, limitPerWallet: e.target.value }))}
                    />
                  </label>
                  <label className="phase-field">
                    <span className="phase-label">Start date</span>
                    <input
                      className="phase-input"
                      type="datetime-local"
                      value={phaseForm.startsAt}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                    />
                  </label>
                  <label className="phase-field sm:col-span-2">
                    <span className="phase-label">End date</span>
                    <input
                      className="phase-input"
                      type="datetime-local"
                      value={phaseForm.endsAt}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                    onClick={handleSavePhase}
                  >
                    {editingPhaseId ? "Update Phase" : "Add Phase"}
                  </button>
                  <span className="text-xs text-slate-400">
                    These phases are stored on-chain and shown on the mint page.
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Schedule times use your local timezone.
                </p>

                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  {phases.length === 0 ? (
                    <p className="text-sm text-slate-400">No phases added yet.</p>
                  ) : (
                    phases.map((phase) => {
                      const status = getPhaseStatus(phase);
                      return (
                        <div
                          key={phase.id}
                          className="flex flex-col gap-2 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-white">
                                {phase.name} <span className="text-xs text-slate-500"># {phase.id}</span>
                              </p>
                              <p className="text-xs text-slate-400">
                                {formatPhaseWindow(phase)}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                                status === "live"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : status === "upcoming"
                                  ? "bg-sky-500/20 text-sky-300"
                                  : status === "ended"
                                  ? "bg-slate-700/60 text-slate-300"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400">
                            <span>{phase.priceEth} {NATIVE_SYMBOL}</span>
                            <span>Limit {phase.limitPerWallet} per wallet</span>
                            <span>{phase.allowlistEnabled ? "Allowlist on" : "Public"}</span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              className="rounded-xl border border-slate-700 px-3 py-1 text-xs"
                              onClick={() => handleEditPhase(phase)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-xl border border-red-500/70 bg-red-500/10 px-3 py-1 text-xs text-red-200"
                              onClick={() => handleDeletePhase(phase.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Phase Allowlist</p>
                    <h3 className="text-lg font-semibold">Wallet Eligibility</h3>
                  </div>
                  <select
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                    value={allowlistPhaseId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setAllowlistPhaseId(value ? Number(value) : null);
                    }}
                  >
                    {phases.length === 0 ? (
                      <option value="">No phases</option>
                    ) : null}
                    {phases.map((phase) => (
                      <option key={phase.id} value={phase.id}>
                        {phase.name} (ID {phase.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">Allowlist Enabled</p>
                    <p className="text-xs text-slate-400">Only approved wallets can mint</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={allowlistEnabled}
                    aria-label="Toggle allowlist"
                    disabled={isBusy || allowlistPhaseId === null}
                    onClick={handleToggleAllowlist}
                    className={`toggle ${allowlistEnabled ? "toggle-on" : ""}`}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>

                <div className="mt-4">
                  <label className="phase-label">Merkle root (optional)</label>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                    <input
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      placeholder="0x..."
                      value={allowlistRoot}
                      onChange={(event) => setAllowlistRoot(event.target.value)}
                    />
                    <button
                      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                      onClick={handleSetAllowlistRoot}
                    >
                      Set Merkle Root
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Leave empty to clear. If a root is set, wallet proofs are required.
                  </p>
                </div>

                <div className="mt-4">
                  <label className="phase-label">Wallet addresses (one per line or comma separated)</label>
                  <textarea
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
                    rows={4}
                    placeholder="0xabc...\n0xdef..."
                    value={allowlistWallets}
                    onChange={(event) => setAllowlistWallets(event.target.value)}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                    onClick={() => handleAllowlistUpdate(true)}
                  >
                    Add wallets
                  </button>
                  <button
                    className="rounded-xl border border-amber-500/60 bg-amber-500/10 px-4 py-2 text-sm text-amber-100"
                    onClick={() => handleAllowlistUpdate(false)}
                  >
                    Remove wallets
                  </button>
                  <button
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm"
                    onClick={() => setAllowlistWallets("")}
                  >
                    Clear
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Allowlist data is stored on-chain. Add wallets in small batches to avoid gas limits.
                </p>
              </div>

              <button
                className="w-full rounded-xl border border-slate-700 px-4 py-2 text-sm"
                onClick={handleWithdraw}
                disabled={isBusy}
              >
                Withdraw {NATIVE_SYMBOL}
              </button>

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
            </section>

            <section className="space-y-6">
              <div className="glass-card">
                <h3 className="text-lg font-semibold">System Status</h3>
                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Owner</span>
                    <span className="text-white">{owner || "Loading..."}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Paused</span>
                    <span className="text-white">{paused ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Revealed</span>
                    <span className="text-white">{revealed ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Freeze Collection</span>
                    <span className="text-white">
                      {transfersLocked ? "On" : "Off"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="glass-card">
                <h3 className="text-lg font-semibold">Contract</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Address</span>
                    <span className="text-white">{CONTRACT_ADDRESS || "Not set"}</span>
                  </div>
                  <button
                    className="w-full rounded-xl border border-slate-700 px-4 py-2 text-sm"
                    onClick={handleCopyContract}
                  >
                    Copy Contract Address
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                The collection is frozen to prevent secondary sales until you unfreeze it.
              </div>
            </section>
            </main>
          </>
        ) : (
          <main className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="glass-card">
              <h3 className="text-lg font-semibold">Admin Access</h3>
              <p className="mt-3 text-sm text-slate-300">
                Connect with the contract owner wallet on {NETWORK_NAME} to access admin controls.
              </p>
              {status.message ? (
                <div
                  className={`mt-5 rounded-2xl border p-4 text-sm ${
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
            </section>

            <section className="space-y-6">
              <div className="glass-card">
                <h3 className="text-lg font-semibold">System Status</h3>
                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Owner</span>
                    <span className="text-white">{owner || "Loading..."}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Paused</span>
                    <span className="text-white">{paused ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Revealed</span>
                    <span className="text-white">{revealed ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Freeze Collection</span>
                    <span className="text-white">{transfersLocked ? "On" : "Off"}</span>
                  </div>
                </div>
              </div>

              <div className="glass-card">
                <h3 className="text-lg font-semibold">Contract</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Address</span>
                    <span className="text-white">{CONTRACT_ADDRESS || "Not set"}</span>
                  </div>
                  <button
                    className="w-full rounded-xl border border-slate-700 px-4 py-2 text-sm"
                    onClick={handleCopyContract}
                  >
                    Copy Contract Address
                  </button>
                </div>
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
