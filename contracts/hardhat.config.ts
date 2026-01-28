import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import path from "path";
import "dotenv/config";

const disableTypechain =
  process.env.HARDHAT_DISABLE_TYPECHAIN === "1" ||
  process.env.HARDHAT_DISABLE_TYPECHAIN === "true";

if (disableTypechain) {
  // Load only the plugins we need, excluding TypeChain to avoid compile stalls.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("@nomicfoundation/hardhat-ethers");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("@nomicfoundation/hardhat-chai-matchers");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("@nomicfoundation/hardhat-verify");
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("@nomicfoundation/hardhat-toolbox");
}

const DEV_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const EXTERNAL_DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];
const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";
const RPC_L2 = process.env.RPC_L2 ?? "http://localhost:29545";
const RPC_L3 = process.env.RPC_L3 ?? "http://localhost:39545";
const L1_CHAIN_ID = Number(process.env.L1_CHAIN_ID ?? 14000101);
const L2_CHAIN_ID = Number(process.env.L2_CHAIN_ID ?? 901);
const L3_CHAIN_ID = Number(process.env.L3_CHAIN_ID ?? 903);
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com";
const POLYGON_AMOY_RPC_URL =
  process.env.POLYGON_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY ?? "";
const OP_L2_RPC = process.env.OP_L2_RPC ?? "http://localhost:29545";
const OP_L3_RPC = process.env.OP_L3_RPC ?? "http://localhost:39545";
const OP_L2_CHAIN_ID = Number(process.env.OP_L2_CHAIN_ID ?? 901);
const OP_L3_CHAIN_ID = Number(process.env.OP_L3_CHAIN_ID ?? 902);
const ENABLE_VIA_IR = process.env.HARDHAT_VIA_IR !== "false";
const USE_DOCKER_SOLC =
  process.env.HARDHAT_USE_DOCKER_SOLC === "1" ||
  process.env.HARDHAT_USE_DOCKER_SOLC === "true";

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

if (USE_DOCKER_SOLC) {
  const dockerSolcDir = path.join(__dirname, "scripts", "solc-docker");
  const dockerSolcByVersion: Record<string, string> = {
    "0.8.24": path.join(dockerSolcDir, "solc-0.8.24.sh")
  };

  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async (args, hre, runSuper) => {
    const build = await runSuper(args);
    const dockerPath = dockerSolcByVersion[args.solcVersion as string];
    if (dockerPath) {
      return {
        ...build,
        compilerPath: dockerPath,
        isSolcJs: false
      };
    }
    return build;
  });
}

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
      url: RPC_L1,
      chainId: L1_CHAIN_ID,
      accounts: [DEV_PRIVATE_KEY],
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl2: {
      url: RPC_L2,
      chainId: L2_CHAIN_ID,
      accounts: [DEV_PRIVATE_KEY],
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl3: {
      url: RPC_L3,
      chainId: L3_CHAIN_ID,
      accounts: [DEV_PRIVATE_KEY],
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl2Op: {
      url: OP_L2_RPC,
      chainId: OP_L2_CHAIN_ID,
      accounts: [DEV_PRIVATE_KEY],
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    ghostl3Op: {
      url: OP_L3_RPC,
      chainId: OP_L3_CHAIN_ID,
      accounts: [DEV_PRIVATE_KEY],
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    polygon: {
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts: EXTERNAL_DEPLOYER_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      gasPrice: 1_000_000_000
    },
    polygonAmoy: {
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
