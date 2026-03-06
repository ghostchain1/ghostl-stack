/**
 * @file chains.ts
 * @module @ghostchain/ghostchain-util/chains
 *
 * GhostChain canonical chain IDs and per-chain configuration constants.
 * These are the ONLY chain IDs that should appear in product code.
 */

import type { GhostChainConfig } from "./types.js";

// ─── GhostChain ID enum ───────────────────────────────────────────────────────

/**
 * Canonical GhostChain chain IDs.
 * Never use raw integers — always reference this enum.
 */
export const GhostChainId = {
  /** GhostChain L1 — devnet/testnet */
  L1_DEVNET:   14000101,
  /** GhostChain L2 — devnet/testnet */
  L2_DEVNET:   14000102,
  /** GhostChain L3 — devnet/testnet */
  L3_DEVNET:   14000103,
  /** GhostChain L1 — mainnet */
  L1_MAINNET:  14000001,
  /** GhostChain L2 — mainnet */
  L2_MAINNET:  14000002,
  /** GhostChain L3 — mainnet */
  L3_MAINNET:  14000003,
} as const;

export type GhostChainId = (typeof GhostChainId)[keyof typeof GhostChainId];

// ─── Human-readable layer names ───────────────────────────────────────────────

export const GHOST_CHAIN_NAMES: Record<GhostChainId, string> = {
  [GhostChainId.L1_DEVNET]:  "GhostChain L1 (devnet)",
  [GhostChainId.L2_DEVNET]:  "GhostChain L2 (devnet)",
  [GhostChainId.L3_DEVNET]:  "GhostChain L3 (devnet)",
  [GhostChainId.L1_MAINNET]: "GhostChain L1",
  [GhostChainId.L2_MAINNET]: "GhostChain L2",
  [GhostChainId.L3_MAINNET]: "GhostChain L3",
};

// ─── RPC endpoints ─────────────────────────────────────────────────────────────

/** Devnet RPC endpoints (internal VM IPs) */
export const GHOST_DEVNET_RPC: Record<number, string> = {
  [GhostChainId.L1_DEVNET]: "http://10.50.99.20:8545",
  [GhostChainId.L2_DEVNET]: "http://10.50.99.20:9545",
  [GhostChainId.L3_DEVNET]: "http://10.50.99.20:10545",
};

/** Mainnet RPC endpoints */
export const GHOST_MAINNET_RPC: Record<number, string> = {
  [GhostChainId.L1_MAINNET]: "http://10.50.99.70:8545",
  [GhostChainId.L2_MAINNET]: "http://10.50.99.76:9545",
  [GhostChainId.L3_MAINNET]: "http://10.50.99.78:10545",
};

// ─── GhostChainConfig presets ─────────────────────────────────────────────────

export const GHOST_CHAINS: Record<string, GhostChainConfig> = {
  "l1-devnet": {
    name: "GhostChain L1 (devnet)",
    chainId: GhostChainId.L1_DEVNET,
    rpc: GHOST_DEVNET_RPC[GhostChainId.L1_DEVNET],
    fallbackRpcs: ["http://10.50.99.21:8545", "http://10.50.99.22:8545"],
    isMainnet: false,
  },
  "l2-devnet": {
    name: "GhostChain L2 (devnet)",
    chainId: GhostChainId.L2_DEVNET,
    rpc: GHOST_DEVNET_RPC[GhostChainId.L2_DEVNET],
    isMainnet: false,
  },
  "l3-devnet": {
    name: "GhostChain L3 (devnet)",
    chainId: GhostChainId.L3_DEVNET,
    rpc: GHOST_DEVNET_RPC[GhostChainId.L3_DEVNET],
    isMainnet: false,
  },
  "l1-mainnet": {
    name: "GhostChain L1",
    chainId: GhostChainId.L1_MAINNET,
    rpc: GHOST_MAINNET_RPC[GhostChainId.L1_MAINNET],
    fallbackRpcs: ["http://10.50.99.72:8545"],
    isMainnet: true,
  },
  "l2-mainnet": {
    name: "GhostChain L2",
    chainId: GhostChainId.L2_MAINNET,
    rpc: GHOST_MAINNET_RPC[GhostChainId.L2_MAINNET],
    isMainnet: true,
  },
  "l3-mainnet": {
    name: "GhostChain L3",
    chainId: GhostChainId.L3_MAINNET,
    rpc: GHOST_MAINNET_RPC[GhostChainId.L3_MAINNET],
    isMainnet: true,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the given chainId is a registered GhostChain ID.
 */
export function isGhostChainId(chainId: number): chainId is GhostChainId {
  return Object.values(GhostChainId).includes(chainId as GhostChainId);
}

/**
 * Returns true if the chainId belongs to mainnet.
 */
export function isMainnetChain(chainId: number): boolean {
  return (
    chainId === GhostChainId.L1_MAINNET ||
    chainId === GhostChainId.L2_MAINNET ||
    chainId === GhostChainId.L3_MAINNET
  );
}

/**
 * Get the layer (1, 2, or 3) for a chain ID.
 * Returns undefined if not a recognised Ghost chain.
 */
export function ghostChainLayer(chainId: number): 1 | 2 | 3 | undefined {
  if (chainId === GhostChainId.L1_DEVNET || chainId === GhostChainId.L1_MAINNET) return 1;
  if (chainId === GhostChainId.L2_DEVNET || chainId === GhostChainId.L2_MAINNET) return 2;
  if (chainId === GhostChainId.L3_DEVNET || chainId === GhostChainId.L3_MAINNET) return 3;
  return undefined;
}

/**
 * Get the GhostChainConfig for a key like "l1-devnet" or "l2-mainnet".
 */
export function ghostChain(key: string): GhostChainConfig {
  const cfg = GHOST_CHAINS[key];
  if (!cfg) throw new Error(`Unknown Ghost chain key: "${key}". Valid keys: ${Object.keys(GHOST_CHAINS).join(", ")}`);
  return cfg;
}
