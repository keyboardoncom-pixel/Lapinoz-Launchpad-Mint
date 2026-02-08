import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const {
  MAINNET_RPC_URL,
  SEPOLIA_RPC_URL,
  GOERLI_RPC_URL,
  POLYGON_RPC_URL,
  PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  POLYGONSCAN_API_KEY,
} = process.env;

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL || "",
      accounts,
    },
    polygon: {
      url: POLYGON_RPC_URL || "",
      accounts,
      chainId: 137,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts,
    },
    goerli: {
      url: GOERLI_RPC_URL || "",
      accounts,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || POLYGONSCAN_API_KEY || "",
  },
};

export default config;
