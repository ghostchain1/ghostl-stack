import { HardhatUserConfig } from "hardhat/config";



import "dotenv/config";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const LOCAL_ACCOUNTS = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];
const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:18545";
const RPC_L2 = process.env.RPC_L2 ?? "http://localhost:29547";
const RPC_L3 = process.env.RPC_L3 ?? "http://localhost:39545";
const L1_CHAIN_ID = Number(process.env.L1_CHAIN_ID ?? 14000101);
const L2_CHAIN_ID = Number(process.env.L2_CHAIN_ID ?? 901);
const L3_CHAIN_ID = Number(process.env.L3_CHAIN_ID ?? 903);

// ─── Mainchain enforcement ────────────────────────────────────────────────────
// Reject env-var overrides that point at non-Ghost chains. Deployments may
// only target GhostChain (14000101), GhostL2 (901), or GhostL3 (903).
const CANONICAL_CHAINS: Readonly<Record<number, string>> = {
  14000101: "GhostChain",
  901: "GhostL2",
  903: "GhostL3",
};
for (const [envVar, id, expected] of [
  ["L1_CHAIN_ID", L1_CHAIN_ID, 14000101],
  ["L2_CHAIN_ID", L2_CHAIN_ID, 901],
  ["L3_CHAIN_ID", L3_CHAIN_ID, 903],
] as const) {
  if (!CANONICAL_CHAINS[id]) {
    throw new Error(
      `[hardhat] ${envVar}=${id} is not a recognised GhostChain mainchain. ` +
      `Permitted values: 14000101 (GhostChain), 901 (GhostL2), 903 (GhostL3).`,
    );
  }
  if (id !== expected) {
    throw new Error(
      `[hardhat] ${envVar}=${id} is assigned to the wrong layer. ` +
      `Expected ${expected} (${CANONICAL_CHAINS[expected]}). ` +
      `Do not swap chain IDs between layers.`,
    );
  }
}
// ─────────────────────────────────────────────────────────────────────────────
const ENABLE_VIA_IR = process.env.HARDHAT_VIA_IR !== "false";
const REQUEST_TIMEOUT_MS = 120_000;

const enableModelChecker = process.env.FORMAL_VERIFY === "true";
const soliditySettings = enableModelChecker
  ? {
      optimizer: { enabled: true, runs: 200 },
      viaIR: ENABLE_VIA_IR,
      modelChecker: {
        engine: "chc" as const,
        timeout: 60_000,
        targets: ["assert", "overflow", "divByZero", "outOfBounds"] as string[]
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
    }
  }
};

export default config;
