import { ethers } from "ethers";
import { ethers5Adapter } from "thirdweb/adapters/ethers5";
import { THIRDWEB_CLIENT, TARGET_CHAIN } from "./thirdweb";

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
export const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 0);

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

export function getReadContract() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing NEXT_PUBLIC_CONTRACT_ADDRESS");
  }
  if (!RPC_URL) {
    throw new Error("Missing NEXT_PUBLIC_RPC_URL");
  }
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
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
