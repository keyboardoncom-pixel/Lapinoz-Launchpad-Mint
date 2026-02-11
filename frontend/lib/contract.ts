import { ethers } from "ethers";
import { ethers5Adapter } from "thirdweb/adapters/ethers5";
import { THIRDWEB_CLIENT, TARGET_CHAIN } from "./thirdweb";

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
export const RPC_FALLBACK_URLS = (process.env.NEXT_PUBLIC_RPC_FALLBACK_URLS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
export const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 0);
const RPC_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_RPC_TIMEOUT_MS || 10000);
const READ_RETRY_ATTEMPTS = Math.max(1, Number(process.env.NEXT_PUBLIC_RPC_READ_RETRY_ATTEMPTS || 2));
const READ_RETRY_DELAY_MS = Math.max(0, Number(process.env.NEXT_PUBLIC_RPC_READ_RETRY_DELAY_MS || 250));

let cachedReadProvider: ethers.providers.FallbackProvider | null = null;

export const MINTNFT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "quantity", "type": "uint256" },
      { "internalType": "bytes32[]", "name": "proof", "type": "bytes32[]" }
    ],
    "name": "publicMint",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "notRevealedURI",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "mintPrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "launchpadFee",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeRecipient",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxMintPerWallet",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ownerOf",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "baseURI",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "transfersLocked",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "revealed",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "string", "name": "newBaseURI", "type": "string" }],
    "name": "setBaseURI",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "string", "name": "newNotRevealedURI", "type": "string" }],
    "name": "setNotRevealedURI",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "feeWei", "type": "uint256" }],
    "name": "setLaunchpadFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "recipient", "type": "address" }],
    "name": "setFeeRecipient",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "newMaxSupply", "type": "uint256" }],
    "name": "setMaxSupply",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bool", "name": "locked", "type": "bool" }],
    "name": "setTransfersLocked",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bool", "name": "value", "type": "bool" }],
    "name": "setRevealed",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "phaseCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdrawableBalance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "phaseId", "type": "uint256" }],
    "name": "phases",
    "outputs": [
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "uint64", "name": "startTime", "type": "uint64" },
      { "internalType": "uint64", "name": "endTime", "type": "uint64" },
      { "internalType": "uint128", "name": "price", "type": "uint128" },
      { "internalType": "uint32", "name": "maxPerWallet", "type": "uint32" },
      { "internalType": "bool", "name": "exists", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "phaseId", "type": "uint256" }],
    "name": "phaseAllowlistEnabled",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "phaseId", "type": "uint256" }],
    "name": "phaseMerkleRoot",
    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "phaseId", "type": "uint256" },
      { "internalType": "address", "name": "wallet", "type": "address" }
    ],
    "name": "phaseAllowlist",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "uint64", "name": "startTime", "type": "uint64" },
      { "internalType": "uint64", "name": "endTime", "type": "uint64" },
      { "internalType": "uint128", "name": "price", "type": "uint128" },
      { "internalType": "uint32", "name": "maxPerWallet", "type": "uint32" }
    ],
    "name": "addPhase",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "phaseId", "type": "uint256" },
      { "internalType": "bool", "name": "enabled", "type": "bool" }
    ],
    "name": "setPhaseAllowlistEnabled",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "phaseId", "type": "uint256" },
      { "internalType": "bytes32", "name": "root", "type": "bytes32" }
    ],
    "name": "setPhaseMerkleRoot",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "phaseId", "type": "uint256" },
      { "internalType": "address[]", "name": "wallets", "type": "address[]" },
      { "internalType": "bool", "name": "allowed", "type": "bool" }
    ],
    "name": "setPhaseAllowlist",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "phaseId", "type": "uint256" },
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "uint64", "name": "startTime", "type": "uint64" },
      { "internalType": "uint64", "name": "endTime", "type": "uint64" },
      { "internalType": "uint128", "name": "price", "type": "uint128" },
      { "internalType": "uint32", "name": "maxPerWallet", "type": "uint32" }
    ],
    "name": "updatePhase",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "phaseId", "type": "uint256" }],
    "name": "removePhase",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getActivePhase",
    "outputs": [
      { "internalType": "bool", "name": "active", "type": "bool" },
      { "internalType": "uint256", "name": "phaseId", "type": "uint256" },
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "uint256", "name": "price", "type": "uint256" },
      { "internalType": "uint256", "name": "maxPerWallet", "type": "uint256" },
      { "internalType": "uint64", "name": "startTime", "type": "uint64" },
      { "internalType": "uint64", "name": "endTime", "type": "uint64" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

function getRpcCandidates() {
  const merged = [RPC_URL, ...RPC_FALLBACK_URLS].filter(Boolean);
  return Array.from(new Set(merged));
}

export function getReadProvider() {
  if (cachedReadProvider) {
    return cachedReadProvider;
  }

  const candidates = getRpcCandidates();
  if (!candidates.length) {
    throw new Error("Missing NEXT_PUBLIC_RPC_URL or NEXT_PUBLIC_RPC_FALLBACK_URLS");
  }

  const network =
    TARGET_CHAIN_ID > 0 ? { chainId: TARGET_CHAIN_ID, name: "target-chain" } : undefined;
  const fallbackConfigs = candidates.map((url, index) => ({
    provider: new ethers.providers.StaticJsonRpcProvider(
      { url, timeout: RPC_TIMEOUT_MS },
      network
    ),
    priority: index + 1,
    stallTimeout: index === 0 ? 800 : 1200,
    weight: index === 0 ? 3 : 1,
  }));

  cachedReadProvider = new ethers.providers.FallbackProvider(fallbackConfigs, 1);
  cachedReadProvider.pollingInterval = 12000;
  return cachedReadProvider;
}

export function getReadContract() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing NEXT_PUBLIC_CONTRACT_ADDRESS");
  }
  const provider = getReadProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, MINTNFT_ABI, provider);
}

export async function getWriteContract(account?: any, chain?: any) {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing NEXT_PUBLIC_CONTRACT_ADDRESS");
  }
  if (!account) {
    throw new Error("Wallet not connected");
  }
  const signer = await ethers5Adapter.signer.toEthers({
    client: THIRDWEB_CLIENT,
    account,
    chain: chain ?? TARGET_CHAIN,
  });
  return new ethers.Contract(CONTRACT_ADDRESS, MINTNFT_ABI, signer);
}

export async function withReadRetry<T>(task: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= READ_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (error: any) {
      lastError = error;
      if (attempt >= READ_RETRY_ATTEMPTS || !isRetryableRpcError(error)) {
        throw error;
      }
      const waitMs = READ_RETRY_DELAY_MS * attempt;
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastError;
}

function isRetryableRpcError(error: any) {
  const message = String(error?.message || error?.reason || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code.includes("timeout") ||
    code.includes("network") ||
    code.includes("server") ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("gateway timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("missing response")
  );
}

export function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function isSameAddress(a?: string, b?: string) {
  if (!a || !b) return false;
  try {
    return ethers.utils.getAddress(a) === ethers.utils.getAddress(b);
  } catch {
    return false;
  }
}
