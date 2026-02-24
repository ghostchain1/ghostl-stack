import { HardhatUserConfig } from "hardhat/config";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const LOCAL_ACCOUNTS = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];
const EXTERNAL_DEPLOYER_KEY = LOCAL_ACCOUNTS;
const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";
const RPC_L2 = process.env.RPC_L2 ?? "http://localhost:29547";
const RPC_L3 = process.env.RPC_L3 ?? "http://localhost:39545";
const L1_CHAIN_ID = Number(process.env.L1_CHAIN_ID ?? 14000101);
const L2_CHAIN_ID = Number(process.env.L2_CHAIN_ID ?? 901);
const L3_CHAIN_ID = Number(process.env.L3_CHAIN_ID ?? 903);
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com";
const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY ?? "";
const OP_L2_RPC = process.env.OP_L2_RPC ?? "http://localhost:29547";
const OP_L3_RPC = process.env.OP_L3_RPC ?? "http://localhost:39545";
const OP_L2_CHAIN_ID = Number(process.env.OP_L2_CHAIN_ID ?? 901);
const OP_L3_CHAIN_ID = Number(process.env.OP_L3_CHAIN_ID ?? 903);
const ENABLE_VIA_IR = process.env.HARDHAT_VIA_IR !== "false";
const REQUEST_TIMEOUT_MS = 120_000;

const enableModelChecker = process.env.FORMAL_VERIFY === "true";
const soliditySettings = enableModelChecker
  ? {
      optimizer: { enabled: true, runs: 200 },
      viaIR: ENABLE_VIA_IR,
      modelChecker: {
        engine: "chc",
        timeout: 60_000,
        targets: ["assert", "overflow", "divByZero", "outOfBounds"]
      }
    }
  : { optimizer: { enabled: true, runs: 200 }, viaIR: ENABLE_VIA_IR };

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: soliditySettings
  },
  paths: {
    sources: "./src",
    cache: "./.hardhat-cache"
  },
  networks: {
    anvil: {
      type: "http",
      url: RPC_L1,
      chainId: L1_CHAIN_ID,
      accounts: LOCAL_ACCOUNTS,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl2: {
      type: "http",
      url: RPC_L2,
      chainId: L2_CHAIN_ID,
      accounts: LOCAL_ACCOUNTS,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl3: {
      type: "http",
      url: RPC_L3,
      chainId: L3_CHAIN_ID,
      accounts: LOCAL_ACCOUNTS,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl2Op: {
      type: "http",
      url: OP_L2_RPC,
      chainId: OP_L2_CHAIN_ID,
      accounts: LOCAL_ACCOUNTS,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl3Op: {
      type: "http",
      url: OP_L3_RPC,
      chainId: OP_L3_CHAIN_ID,
      accounts: LOCAL_ACCOUNTS,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    polygon: {
      type: "http",
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts: EXTERNAL_DEPLOYER_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    polygonAmoy: {
      type: "http",
      url: POLYGON_AMOY_RPC_URL,
      chainId: 80002,
      accounts: EXTERNAL_DEPLOYER_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    }
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_API_KEY,
      polygonAmoy: POLYGONSCAN_API_KEY
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  }
};

export default config;
