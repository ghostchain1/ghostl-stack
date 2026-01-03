import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const EXTERNAL_DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com";
const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  paths: {
    sources: "./src"
  },
  networks: {
    anvil: { url: "http://localhost:8545", chainId: 31337 },
    ghostl2: { url: "http://localhost:9545", chainId: 7192, accounts: [DEV_PRIVATE_KEY] },
    ghostl3: { url: "http://localhost:10545", chainId: 7393, accounts: [DEV_PRIVATE_KEY] },
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
