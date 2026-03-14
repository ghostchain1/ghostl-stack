/**
 * GhostLayerResolver
 *
 * Resolves the correct GhostStack layer for a given EVM chain ID or layer name.
 * Provides canonical chain ID ↔ layer name ↔ RPC URL lookups.
 *
 * Usage:
 *   const resolver = new GhostLayerResolver();
 *   resolver.layerForChainId(901);  // → "L2"
 *   resolver.chainIdFor("L3");      // → 903
 *   resolver.rpcFor("L1");          // → "http://localhost:18545"
 */

import { GhostNetworks, type GhostLayer, type GhostNetworkConfig } from "../networks.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LayerResolution {
  layer:     GhostLayer;
  chainId:   number;
  rpcUrl:    string;
  name:      string;
  symbol:    "GST";
}

// ── GhostLayerResolver ────────────────────────────────────────────────────────

export class GhostLayerResolver {
  private readonly networks: Record<GhostLayer, GhostNetworkConfig>;

  constructor(overrides?: Partial<Record<GhostLayer, Partial<GhostNetworkConfig>>>) {
    this.networks = {
      L1: { ...GhostNetworks.L1, ...(overrides?.L1 ?? {}) },
      L2: { ...GhostNetworks.L2, ...(overrides?.L2 ?? {}) },
      L3: { ...GhostNetworks.L3, ...(overrides?.L3 ?? {}) },
    };
  }

  // ── Lookups ───────────────────────────────────────────────────────────────

  /** Resolve `chainId` → `GhostLayer`. Returns `null` if unknown. */
  layerForChainId(chainId: number): GhostLayer | null {
    for (const [layer, cfg] of Object.entries(this.networks) as [GhostLayer, GhostNetworkConfig][]) {
      if (cfg.chainId === chainId) return layer;
    }
    return null;
  }

  /** Resolve `GhostLayer` → EVM chain ID. Throws if layer is unknown. */
  chainIdFor(layer: GhostLayer): number {
    return this._cfg(layer).chainId;
  }

  /** Resolve `GhostLayer` → RPC URL. Throws if layer is unknown. */
  rpcFor(layer: GhostLayer): string {
    return this._cfg(layer).rpc;
  }

  /** Full resolution for a layer. */
  resolve(layer: GhostLayer): LayerResolution {
    const cfg = this._cfg(layer);
    return {
      layer,
      chainId:  cfg.chainId,
      rpcUrl:   cfg.rpc,
      name:     cfg.name,
      symbol:   "GST",
    };
  }

  /** Resolve from a chain ID (throws if not a GhostStack chain). */
  resolveByChainId(chainId: number): LayerResolution {
    const layer = this.layerForChainId(chainId);
    if (!layer) throw new Error(`GhostLayerResolver: unknown chainId ${chainId}`);
    return this.resolve(layer);
  }

  /** Return all registered layers. */
  allLayers(): GhostLayer[] {
    return Object.keys(this.networks) as GhostLayer[];
  }

  /** Check if chain ID belongs to GhostStack. */
  isGhostChain(chainId: number): boolean {
    return this.layerForChainId(chainId) !== null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _cfg(layer: GhostLayer): GhostNetworkConfig {
    const cfg = this.networks[layer];
    if (!cfg) throw new Error(`GhostLayerResolver: unknown layer "${layer}"`);
    return cfg;
  }
}

/** Default resolver instance pre-seeded with all GhostStack networks. */
export const ghostLayerResolver = new GhostLayerResolver();
