import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  paths: {
    sources: "./src"
  },
  networks: {
    anvil: { url: "http://localhost:8545", chainId: 31337 },
    ghostl2: { url: "http://localhost:9545", chainId: 7192, accounts: [DEV_PRIVATE_KEY] },
    ghostl3: { url: "http://localhost:10545", chainId: 7393, accounts: [DEV_PRIVATE_KEY] }
  }
};

export default config;
