import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    anvil: { url: "http://localhost:8545", chainId: 31337 },
    ghostl2: { url: "http://localhost:9545", chainId: 7192 },
    ghostl3: { url: "http://localhost:10545", chainId: 7393 }
  }
};

export default config;
