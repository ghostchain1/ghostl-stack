/**
 * @file chains.ts
 * @module @ghostchain/ghostchain-util/chains
 *
 * GhostChain canonical chain IDs and environment-specific configuration constants.
 * These are the ONLY chain IDs that should appear in product code.
 */

import type { GhostChainConfig } from "./types.js";

// ─── GhostChain ID enum ───────────────────────────────────────────────────────

const GHOST_CANONICAL_CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;

/**
 * Canonical GhostChain chain IDs.
 * Never use raw integers; always reference this enum.
 *
 * Legacy environment aliases are retained for compatibility, but they resolve
 * to the same canonical layer IDs because GhostChain uses fixed chain identity
 * across devnet, testnet, and mainnet.
 */
export const GhostChainId = {
  ...GHOST_CANONICAL_CHAIN_IDS,
  L1_DEVNET: GHOST_CANONICAL_CHAIN_IDS.L1,
  L2_DEVNET: GHOST_CANONICAL_CHAIN_IDS.L2,
  L3_DEVNET: GHOST_CANONICAL_CHAIN_IDS.L3,
  L1_TESTNET: GHOST_CANONICAL_CHAIN_IDS.L1,
  L2_TESTNET: GHOST_CANONICAL_CHAIN_IDS.L2,
  L3_TESTNET: GHOST_CANONICAL_CHAIN_IDS.L3,
  L1_MAINNET: GHOST_CANONICAL_CHAIN_IDS.L1,
  L2_MAINNET: GHOST_CANONICAL_CHAIN_IDS.L2,
  L3_MAINNET: GHOST_CANONICAL_CHAIN_IDS.L3,
} as const;

export type GhostChainId = (typeof GHOST_CANONICAL_CHAIN_IDS)[keyof typeof GHOST_CANONICAL_CHAIN_IDS];
export type GhostEnvironment = "devnet" | "testnet" | "mainnet";
export type GhostChainKey =
  | "l1-devnet"
  | "l2-devnet"
  | "l3-devnet"
  | "l1-testnet"
  | "l2-testnet"
  | "l3-testnet"
  | "l1-mainnet"
  | "l2-mainnet"
  | "l3-mainnet";

// ─── Human-readable layer names ───────────────────────────────────────────────

export const GHOST_CHAIN_NAMES: Record<GhostChainId, string> = {
  [GhostChainId.L1]: "GhostChain L1",
  [GhostChainId.L2]: "GhostChain L2",
  [GhostChainId.L3]: "GhostChain L3",
};

// ─── RPC endpoints ─────────────────────────────────────────────────────────────

/** Devnet RPC endpoints (all chains run locally on the devnet controller). */
export const GHOST_DEVNET_RPC: Record<GhostChainId, string> = {
  [GhostChainId.L1]: "http://localhost:18545",
  [GhostChainId.L2]: "http://localhost:7260",
  [GhostChainId.L3]: "http://localhost:7270",
};

/** Testnet RPC endpoints */
export const GHOST_TESTNET_RPC: Record<GhostChainId, string> = {
  [GhostChainId.L1]: "http://10.50.99.71:18545",
  [GhostChainId.L2]: "http://10.50.99.77:7260",
  [GhostChainId.L3]: "http://10.50.99.79:7270",
};

/** Mainnet RPC endpoints */
export const GHOST_MAINNET_RPC: Record<GhostChainId, string> = {
  [GhostChainId.L1]: "http://10.50.99.70:18545",
  [GhostChainId.L2]: "http://10.50.99.76:7260",
  [GhostChainId.L3]: "http://10.50.99.78:7270",
};

// ─── GhostChainConfig presets ─────────────────────────────────────────────────

export const GHOST_CHAINS: Record<GhostChainKey, GhostChainConfig> = {
  "l1-devnet": {
    name: "GhostChain L1 (devnet)",
    chainId: GhostChainId.L1,
    rpc: GHOST_DEVNET_RPC[GhostChainId.L1],
    isMainnet: false,
  },
  "l2-devnet": {
    name: "GhostChain L2 (devnet)",
    chainId: GhostChainId.L2,
    rpc: GHOST_DEVNET_RPC[GhostChainId.L2],
    isMainnet: false,
  },
  "l3-devnet": {
    name: "GhostChain L3 (devnet)",
    chainId: GhostChainId.L3,
    rpc: GHOST_DEVNET_RPC[GhostChainId.L3],
    isMainnet: false,
  },
  "l1-testnet": {
    name: "GhostChain L1 (testnet)",
    chainId: GhostChainId.L1,
    rpc: GHOST_TESTNET_RPC[GhostChainId.L1],
    fallbackRpcs: ["http://10.50.99.73:18545"],
    isMainnet: false,
  },
  "l2-testnet": {
    name: "GhostChain L2 (testnet)",
    chainId: GhostChainId.L2,
    rpc: GHOST_TESTNET_RPC[GhostChainId.L2],
    isMainnet: false,
  },
  "l3-testnet": {
    name: "GhostChain L3 (testnet)",
    chainId: GhostChainId.L3,
    rpc: GHOST_TESTNET_RPC[GhostChainId.L3],
    isMainnet: false,
  },
  "l1-mainnet": {
    name: "GhostChain L1",
    chainId: GhostChainId.L1,
    rpc: GHOST_MAINNET_RPC[GhostChainId.L1],
    fallbackRpcs: ["http://10.50.99.72:18545"],
    isMainnet: true,
  },
  "l2-mainnet": {
    name: "GhostChain L2",
    chainId: GhostChainId.L2,
    rpc: GHOST_MAINNET_RPC[GhostChainId.L2],
    isMainnet: true,
  },
  "l3-mainnet": {
    name: "GhostChain L3",
    chainId: GhostChainId.L3,
    rpc: GHOST_MAINNET_RPC[GhostChainId.L3],
    isMainnet: true,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the given chainId is a registered GhostChain ID.
 */
export function isGhostChainId(chainId: number): chainId is GhostChainId {
  return Object.values(GHOST_CANONICAL_CHAIN_IDS).includes(chainId as GhostChainId);
}

/**
 * Returns true if the chain key or config belongs to mainnet.
 * Canonical Ghost chain IDs are shared across environments, so a numeric chainId
 * alone cannot distinguish devnet, testnet, and mainnet.
 */
export function isMainnetChain(chain: GhostChainKey | GhostChainConfig): boolean {
  if (typeof chain === "string") {
    return GHOST_CHAINS[chain]?.isMainnet === true;
  }
  return chain.isMainnet === true;
}

/**
 * Get the layer (1, 2, or 3) for a chain ID.
 * Returns undefined if not a recognised Ghost chain.
 */
export function ghostChainLayer(chainId: number): 1 | 2 | 3 | undefined {
  if (chainId === GhostChainId.L1) return 1;
  if (chainId === GhostChainId.L2) return 2;
  if (chainId === GhostChainId.L3) return 3;
  return undefined;
}

/**
 * Get the GhostChainConfig for a key like "l1-devnet", "l2-testnet", or "l3-mainnet".
 */
export function ghostChain(key: string): GhostChainConfig {
  const cfg = GHOST_CHAINS[key as GhostChainKey];
  if (!cfg) throw new Error(`Unknown Ghost chain key: "${key}". Valid keys: ${Object.keys(GHOST_CHAINS).join(", ")}`);
  return cfg;
}
