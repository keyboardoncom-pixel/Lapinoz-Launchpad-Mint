import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useActiveAccount, useActiveWalletChain, useActiveWalletConnectionStatus } from "thirdweb/react";
import {
  CONTRACT_ADDRESS,
  formatAddress,
  getReadContract,
  getWriteContract,
  isSameAddress,
  MINTNFT_ABI,
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
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const connectionStatus = useActiveWalletConnectionStatus();
  const address = account?.address;
  const isConnected = connectionStatus === "connected" && !!address;

  const [owner, setOwner] = useState<string>("");
  const [baseURI, setBaseURI] = useState<string>("");
  const [mintPrice, setMintPrice] = useState("0");
  const [maxMintPerWallet, setMaxMintPerWallet] = useState("0");
  const [launchpadFee, setLaunchpadFee] = useState("0");
  const [feeRecipient, setFeeRecipient] = useState<string>("");
  const [feeRecipientInput, setFeeRecipientInput] = useState("");
  const [launchpadFeeInput, setLaunchpadFeeInput] = useState("");
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
  const [allowlistSaved, setAllowlistSaved] = useState<string[]>([]);
  const [allowlistDirty, setAllowlistDirty] = useState(false);
  const [allowlistStatus, setAllowlistStatus] = useState<Record<string, boolean>>({});
  const [activePhaseInfo, setActivePhaseInfo] = useState<{ id: number; name: string } | null>(null);

  const isSupportedChain = !chain || SUPPORTED_CHAIN_IDS.includes(chain.id);
  const isTargetChain = TARGET_CHAIN_ID ? !!chain && chain.id === TARGET_CHAIN_ID : true;
  const isCorrectChain = isSupportedChain && isTargetChain;

  const getAdminReadContract = async () => {
    if (account) {
      try {
        return await getWriteContract(account, chain);
      } catch {
        // fall back to RPC provider below
      }
    }
    return getReadContract();
  };

  const refresh = async () => {
    try {
      const contract = await getAdminReadContract();
      const [
        ownerAddress,
        isPaused,
        locked,
        isRevealed,
        currentBaseURI,
        price,
        maxPerWallet,
        fee,
        recipient,
      ] = await Promise.all([
        contract.owner(),
        contract.paused(),
        contract.transfersLocked(),
        contract.revealed(),
        contract.baseURI(),
        contract.mintPrice(),
        contract.maxMintPerWallet(),
        contract.launchpadFee(),
        contract.feeRecipient(),
      ]);
      setOwner(ownerAddress);
      setPaused(isPaused);
      setTransfersLocked(locked);
      setRevealed(isRevealed);
      setBaseURI(currentBaseURI || "");
      setMintPrice(ethers.utils.formatEther(price));
      setMaxMintPerWallet(maxPerWallet.toString());
      setLaunchpadFee(ethers.utils.formatEther(fee));
      setFeeRecipient(recipient || "");
      setLaunchpadFeeInput(ethers.utils.formatEther(fee));
      setFeeRecipientInput(recipient || "");
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

  useEffect(() => {
    if (!mounted) return;
    refresh();
  }, [mounted, address, chain?.id]);

  const refreshPhases = async () => {
    try {
      const contract = await getAdminReadContract();
      const count = await contract.phaseCount();
      const active = await contract.getActivePhase();
      if (active?.[0]) {
        setActivePhaseInfo({ id: Number(active[1]), name: active[2] });
      } else {
        setActivePhaseInfo(null);
      }
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

  // (moved below helper definitions)


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
      const contract = await getWriteContract(account, chain);
      const tx = await contract.setBaseURI(baseURI.trim());
      await tx.wait();
    });
  };

  const handlePauseToggle = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(account, chain);
      const tx = paused ? await contract.unpause() : await contract.pause();
      await tx.wait();
    });
  };

  const handleWithdraw = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(account, chain);
      const tx = await contract.withdraw();
      await tx.wait();
    });
  };

  const handleToggleTransfers = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(account, chain);
      const tx = await contract.setTransfersLocked(!transfersLocked);
      await tx.wait();
    });
  };

  const handleToggleReveal = async () => {
    if (!ensureReady()) return;
    await withTx(async () => {
      const contract = await getWriteContract(account, chain);
      const tx = await contract.setRevealed(!revealed);
      await tx.wait();
    });
  };

  const handleUpdateLaunchpadFee = async () => {
    if (!ensureReady()) return;
    if (!feeRecipientInput || !ethers.utils.isAddress(feeRecipientInput)) {
      setStatus({ type: "error", message: "Enter a valid fee recipient address" });
      return;
    }
    let feeWei;
    try {
      feeWei = ethers.utils.parseEther(launchpadFeeInput || "0");
    } catch {
      setStatus({ type: "error", message: "Invalid fee amount" });
      return;
    }

    const currentFeeWei = ethers.utils.parseEther(launchpadFee || "0");
    const recipientChanged =
      feeRecipientInput && !isSameAddress(feeRecipientInput, feeRecipient);
    const feeChanged = !currentFeeWei.eq(feeWei);

    if (!recipientChanged && !feeChanged) {
      setStatus({ type: "success", message: "Launchpad fee already up to date" });
      return;
    }

    await withTx(async () => {
      const contract = await getWriteContract(account, chain);
      if (recipientChanged) {
        const tx = await contract.setFeeRecipient(feeRecipientInput);
        await tx.wait();
      }
      if (feeChanged) {
        const tx = await contract.setLaunchpadFee(feeWei);
        await tx.wait();
      }
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
      const contract = await getWriteContract(account, chain);
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
        const contract = await getWriteContract(account, chain);
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

  const getAllowlistStorageKey = (phaseId: number | null) => {
    if (phaseId === null) return "";
    const chainId = chain?.id ?? "unknown";
    return `allowlist:${CONTRACT_ADDRESS}:${chainId}:${phaseId}`;
  };

  const loadAllowlistFromStorage = (phaseId: number | null) => {
    if (typeof window === "undefined") return [];
    const key = getAllowlistStorageKey(phaseId);
    if (!key) return [];
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveAllowlistToStorage = (phaseId: number | null, wallets: string[]) => {
    if (typeof window === "undefined") return;
    const key = getAllowlistStorageKey(phaseId);
    if (!key) return;
    window.localStorage.setItem(key, JSON.stringify(wallets));
  };

  const refreshAllowlistStatus = async (wallets: string[]) => {
    if (!wallets.length || allowlistPhaseId === null) {
      setAllowlistStatus({});
      return;
    }
    try {
      const contract = await getAdminReadContract();
      const statuses = await Promise.all(
        wallets.map((wallet) => contract.phaseAllowlist(allowlistPhaseId, wallet))
      );
      const next: Record<string, boolean> = {};
      wallets.forEach((wallet, index) => {
        next[wallet] = Boolean(statuses[index]);
      });
      setAllowlistStatus(next);
    } catch {
      // ignore status refresh failures
    }
  };

  const updateAllowlistCache = (wallets: string[], allowed: boolean) => {
    if (allowlistPhaseId === null) return;
    const current = new Set(loadAllowlistFromStorage(allowlistPhaseId));
    if (allowed) {
      wallets.forEach((wallet) => current.add(wallet));
    } else {
      wallets.forEach((wallet) => current.delete(wallet));
    }
    const next = Array.from(current);
    saveAllowlistToStorage(allowlistPhaseId, next);
    setAllowlistSaved(next);
    setAllowlistWallets(next.join("\n"));
    setAllowlistDirty(false);
    void refreshAllowlistStatus(next);
  };

  const handleRemoveSavedWallet = async (wallet: string) => {
    if (!ensureReady()) return;
    if (allowlistPhaseId === null) {
      setStatus({ type: "error", message: "Select a phase first" });
      return;
    }
    await withTx(async () => {
      const contract = await getWriteContract(account, chain);
      const tx = await contract.setPhaseAllowlist(allowlistPhaseId, [wallet], false);
      await tx.wait();
    });
    updateAllowlistCache([wallet], false);
  };

  useEffect(() => {
    if (!phases.length) return;
    if (allowlistPhaseId === null) {
      if (activePhaseInfo) {
        setAllowlistPhaseId(activePhaseInfo.id);
      } else {
        setAllowlistPhaseId(phases[0].id);
      }
      return;
    }
    const selected = phases.find((phase) => phase.id === allowlistPhaseId);
    if (!selected) {
      if (activePhaseInfo) {
        setAllowlistPhaseId(activePhaseInfo.id);
      } else {
        setAllowlistPhaseId(phases[0].id);
      }
      return;
    }
    setAllowlistEnabled(Boolean(selected.allowlistEnabled));
    setAllowlistRoot(selected.allowlistRoot || "");
    const stored = loadAllowlistFromStorage(allowlistPhaseId);
    setAllowlistSaved(stored);
    setAllowlistDirty(false);
    setAllowlistWallets(stored.join("\n"));
    void refreshAllowlistStatus(stored);
  }, [allowlistPhaseId, phases, activePhaseInfo]);

  const handleToggleAllowlist = async () => {
    if (!ensureReady()) return;
    if (allowlistPhaseId === null) {
      setStatus({ type: "error", message: "Select a phase first" });
      return;
    }
    await withTx(async () => {
      const contract = await getWriteContract(account, chain);
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
      const contract = await getWriteContract(account, chain);
      const tx = await contract.setPhaseAllowlist(allowlistPhaseId, wallets, allowed);
      await tx.wait();
    });
    updateAllowlistCache(wallets, allowed);
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
      const contract = await getWriteContract(account, chain);
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
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Launchpad Fee</p>
                    <h3 className="text-lg font-semibold">Fee Settings</h3>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="phase-field">
                    <span className="phase-label">Fee amount ({NATIVE_SYMBOL})</span>
                    <input
                      className="phase-input"
                      type="number"
                      step="0.0001"
                      value={launchpadFeeInput}
                      onChange={(e) => setLaunchpadFeeInput(e.target.value)}
                    />
                  </label>
                  <label className="phase-field">
                    <span className="phase-label">Fee recipient</span>
                    <input
                      className="phase-input"
                      value={feeRecipientInput}
                      onChange={(e) => setFeeRecipientInput(e.target.value)}
                      placeholder="0x..."
                    />
                  </label>
                </div>
                <div className="phase-actions-row">
                  <button
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                    onClick={handleUpdateLaunchpadFee}
                  >
                    Update Fee
                  </button>
                  <div className="phase-helper">
                    <span>Fee is added on top of mint price for every NFT.</span>
                    <span>Set to 0 to disable the launchpad fee.</span>
                  </div>
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

                <div className="mt-4 phase-grid">
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
                  <label className="phase-field phase-field-full">
                    <span className="phase-label">End date</span>
                    <input
                      className="phase-input"
                      type="datetime-local"
                      value={phaseForm.endsAt}
                      onChange={(e) => setPhaseForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="phase-actions-row">
                  <button
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                    onClick={handleSavePhase}
                  >
                    {editingPhaseId ? "Update Phase" : "Add Phase"}
                  </button>
                  <div className="phase-helper">
                    <span>These phases are stored on-chain and shown on the mint page.</span>
                    <span>Schedule times use your local timezone.</span>
                  </div>
                </div>

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
                          <div className="phase-meta-row">
                            <span className="phase-meta-item">{phase.priceEth} {NATIVE_SYMBOL}</span>
                            <span className="phase-meta-item">Limit {phase.limitPerWallet} per wallet</span>
                            <span className="phase-meta-item">
                              {phase.allowlistEnabled ? "Allowlist on" : "Public"}
                            </span>
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
                {activePhaseInfo ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/70 px-4 py-2 text-xs text-slate-300">
                    <span>
                      Active mint phase: <span className="text-white">{activePhaseInfo.name}</span> (ID {activePhaseInfo.id})
                    </span>
                    {allowlistPhaseId !== activePhaseInfo.id ? (
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200"
                        onClick={() => setAllowlistPhaseId(activePhaseInfo.id)}
                      >
                        Use active phase
                      </button>
                    ) : null}
                  </div>
                ) : null}

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
                    onChange={(event) => {
                      setAllowlistWallets(event.target.value);
                      setAllowlistDirty(true);
                    }}
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
                    onClick={() => {
                      setAllowlistWallets("");
                      setAllowlistDirty(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Allowlist data is stored on-chain. Add wallets in small batches to avoid gas limits.
                </p>
                <div className="mt-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Saved wallets (local)</span>
                    <span>{allowlistSaved.length} wallet{allowlistSaved.length === 1 ? "" : "s"}</span>
                  </div>
                  {allowlistSaved.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No saved wallets yet.</p>
                  ) : (
                    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto text-xs text-slate-300">
                      {allowlistSaved.map((wallet) => (
                        <div
                          key={wallet}
                          className="allowlist-row"
                        >
                          <div className="allowlist-row-left">
                            <span className="allowlist-status">
                              {allowlistStatus[wallet] ? "On" : "Off"}
                            </span>
                            <span className="allowlist-wallet">{wallet}</span>
                          </div>
                          <button
                            className="allowlist-remove"
                            onClick={() => handleRemoveSavedWallet(wallet)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {allowlistDirty ? (
                    <p className="mt-2 text-xs text-amber-300">
                      You have unsaved edits in the text area above.
                    </p>
                  ) : null}
                </div>
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
