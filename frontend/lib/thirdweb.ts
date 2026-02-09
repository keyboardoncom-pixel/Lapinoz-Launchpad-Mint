import { createThirdwebClient, defineChain } from "thirdweb";

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 0) || 1;

if (!clientId && typeof window !== "undefined") {
  console.warn("Missing NEXT_PUBLIC_THIRDWEB_CLIENT_ID for thirdweb ConnectButton.");
}

export const THIRDWEB_CLIENT = createThirdwebClient({ clientId });
export const TARGET_CHAIN = defineChain(chainId);
