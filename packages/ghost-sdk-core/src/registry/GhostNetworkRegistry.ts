/**
 * GhostNetworkRegistry — Canonical GhostChain network metadata
 *
 * Single source of truth for all chain identifiers, RPC endpoints,
 * token symbols, and explorer URLs across L1 / L2 / L3.
 *
 * Usage:
 *   import { GhostNetworkRegistry, ChainLayer } from "@ghostchain/ghost-sdk-core";
 *   const l2 = GhostNetworkRegistry.get(ChainLayer.L2);
 *   console.log(l2.name);     // "GhostL2"
 *   console.log(l2.rpcUrl);   // "http://localhost:29547"
 */

// ── ChainLayer enum ───────────────────────────────────────────────────────────

export enum ChainLayer {
  L1 = 1,
  L2 = 2,
  L3 = 3,
}

// ── GhostNetwork type ─────────────────────────────────────────────────────────

export interface GhostNativeCurrency {
  /** Human-readable token name */
  name: string;
  /** Token ticker symbol */
  symbol: string;
  /** Decimal places (always 18 for GST) */
  decimals: number;
}

export interface GhostNetwork {
  /** Human-readable chain name */
  name: string;
  /** EVM chain ID */
  chainId: number;
  /** Chain layer ordinal */
  layer: ChainLayer;
  /** Primary JSON-RPC endpoint */
  rpcUrl: string;
  /** Fallback RPC endpoints (tried in order on failure) */
  fallbackRpcUrls: string[];
  /** Native currency for gas payments */
  nativeCurrency: GhostNativeCurrency;
  /** Block explorer URL (optional in local dev) */
  blockExplorerUrl?: string;
  /** Whether this network runs as an OP-Stack rollup */
  isRollup: boolean;
}

// ── Canonical network definitions ─────────────────────────────────────────────

const GST: GhostNativeCurrency = {
  name:     "Ghost Settlement Token",
  symbol:   "GST",
  decimals: 18,
};

/** GhostChain L1 — settlement layer */
export const GHOST_L1: GhostNetwork = {
  name:            "GhostChain",
  chainId:         Number(process.env["L1_CHAIN_ID"] ?? 31337),
  layer:           ChainLayer.L1,
  rpcUrl:          process.env["RPC_L1"] ?? "http://localhost:18545",
  fallbackRpcUrls: [],
  nativeCurrency:  GST,
  blockExplorerUrl: process.env["L1_EXPLORER"] ?? undefined,
  isRollup:        false,
};

/** GhostL2 — OP-Stack rollup on top of L1 */
export const GHOST_L2: GhostNetwork = {
  name:            "GhostL2",
  chainId:         Number(process.env["L2_CHAIN_ID"] ?? 42069),
  layer:           ChainLayer.L2,
  rpcUrl:          process.env["RPC_L2"] ?? "http://localhost:29547",
  fallbackRpcUrls: [],
  nativeCurrency:  GST,
  blockExplorerUrl: process.env["L2_EXPLORER"] ?? undefined,
  isRollup:        true,
};

/** GhostL3 — App-chain / hyper-chain on top of L2 */
export const GHOST_L3: GhostNetwork = {
  name:            "GhostL3",
  chainId:         Number(process.env["L3_CHAIN_ID"] ?? 43069),
  layer:           ChainLayer.L3,
  rpcUrl:          process.env["RPC_L3"] ?? "http://localhost:39545",
  fallbackRpcUrls: [],
  nativeCurrency:  GST,
  blockExplorerUrl: process.env["L3_EXPLORER"] ?? undefined,
  isRollup:        true,
};

// ── Registry class ────────────────────────────────────────────────────────────

/**
 * GhostNetworkRegistry — lookup and enumerate all registered Ghost networks.
 *
 * Networks are registered at module initialisation time and can be extended
 * at runtime for testnets or custom devnets.
 */
export class GhostNetworkRegistry {
  private static readonly _networks: Map<ChainLayer, GhostNetwork> = new Map([
    [ChainLayer.L1, GHOST_L1],
    [ChainLayer.L2, GHOST_L2],
    [ChainLayer.L3, GHOST_L3],
  ]);

  /** Retrieve a network by layer. Throws if not found. */
  static get(layer: ChainLayer): GhostNetwork {
    const net = this._networks.get(layer);
    if (!net) throw new Error(`GhostNetworkRegistry: no network for layer ${layer}`);
    return net;
  }

  /** Retrieve a network by EVM chainId. Returns undefined if unknown. */
  static getByChainId(chainId: number): GhostNetwork | undefined {
    for (const net of this._networks.values()) {
      if (net.chainId === chainId) return net;
    }
    return undefined;
  }

  /** Return all registered networks. */
  static all(): GhostNetwork[] {
    return Array.from(this._networks.values());
  }

  /** Register a custom network (e.g. testnet, local devnet). */
  static register(layer: ChainLayer, network: GhostNetwork): void {
    this._networks.set(layer, network);
  }

  /** Check if a given chainId belongs to any registered Ghost network. */
  static isGhostChain(chainId: number): boolean {
    return this.getByChainId(chainId) !== undefined;
  }
}

// ── Convenience re-export (matches hardhat-ghost usage) ───────────────────────

/** Flat object of all networks by layer key, for easy spread/destructuring. */
export const GhostNetworks = {
  L1: GHOST_L1,
  L2: GHOST_L2,
  L3: GHOST_L3,
} as const;
