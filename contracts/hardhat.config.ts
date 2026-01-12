import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const EXTERNAL_DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];
const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";
const RPC_L2 = process.env.RPC_L2 ?? "http://localhost:29545";
const RPC_L3 = process.env.RPC_L3 ?? "http://localhost:39545";
const L1_CHAIN_ID = Number(process.env.L1_CHAIN_ID ?? 1337);
const L2_CHAIN_ID = Number(process.env.L2_CHAIN_ID ?? 901);
const L3_CHAIN_ID = Number(process.env.L3_CHAIN_ID ?? 902);
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com";
const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY ?? "";
const OP_L2_RPC = process.env.OP_L2_RPC ?? "http://localhost:29545";
const OP_L3_RPC = process.env.OP_L3_RPC ?? "http://localhost:39545";
const OP_L2_CHAIN_ID = Number(process.env.OP_L2_CHAIN_ID ?? 901);
const OP_L3_CHAIN_ID = Number(process.env.OP_L3_CHAIN_ID ?? 902);

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  paths: {
    sources: "./src"
  },
  networks: {
    anvil: { url: RPC_L1, chainId: L1_CHAIN_ID, accounts: [DEV_PRIVATE_KEY] },
    ghostl2: { url: RPC_L2, chainId: L2_CHAIN_ID, accounts: [DEV_PRIVATE_KEY] },
    ghostl3: { url: RPC_L3, chainId: L3_CHAIN_ID, accounts: [DEV_PRIVATE_KEY] },
    ghostl2Op: { url: OP_L2_RPC, chainId: OP_L2_CHAIN_ID, accounts: [DEV_PRIVATE_KEY] },
    ghostl3Op: { url: OP_L3_RPC, chainId: OP_L3_CHAIN_ID, accounts: [DEV_PRIVATE_KEY] },
    polygon: { url: POLYGON_RPC_URL, chainId: 137, accounts: EXTERNAL_DEPLOYER_KEY },
    polygonAmoy: { url: POLYGON_AMOY_RPC_URL, chainId: 80002, accounts: EXTERNAL_DEPLOYER_KEY }
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
