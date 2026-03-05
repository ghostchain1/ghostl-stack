/**
 * GhostNetworkRegistry — dynamic chain registry for GhostStack.
 *
 * Extends the static GhostNetworks config with runtime registration,
 * look-up helpers, and per-layer URL override support.
 */

import {
  GhostNetworks,
  GhostLayer,
  GhostNetworkConfig,
  networkByChainId,
  parentLayer,
  DERIVATION_PATH,
} from "../networks.js";

// Re-export so callers only need to import from this file.
export { GhostLayer, GhostNetworkConfig, GhostNetworks, parentLayer, DERIVATION_PATH };

/** Runtime registry — starts with static defaults, can be extended. */
const _registry = new Map<GhostLayer | string, GhostNetworkConfig>(
  (Object.entries(GhostNetworks) as [GhostLayer, GhostNetworkConfig][])
);

export class GhostNetworkRegistry {
  // ── Static registry helpers ──────────────────────────────────────────────

  /**
   * Register (or override) a network configuration.
   * Useful for custom devnet configs at runtime.
   */
  static register(id: string, config: GhostNetworkConfig): void {
    _registry.set(id, config);
  }

  /** Remove a previously registered network. */
  static unregister(id: string): boolean {
    return _registry.delete(id);
  }

  /** Look up by layer key ("L1" | "L2" | "L3") or custom string id. */
  static get(id: string): GhostNetworkConfig | undefined {
    return _registry.get(id);
  }

  /** Look up by chain ID. */
  static getByChainId(chainId: number): GhostNetworkConfig | undefined {
    return networkByChainId(chainId) ??
      [..._registry.values()].find(n => n.chainId === chainId);
  }

  /** Return all registered network configs. */
  static all(): GhostNetworkConfig[] {
    // De-dupe by chainId in case static + dynamic overlap.
    const seen = new Set<number>();
    const out: GhostNetworkConfig[] = [];
    for (const cfg of _registry.values()) {
      if (!seen.has(cfg.chainId)) {
        seen.add(cfg.chainId);
        out.push(cfg);
      }
    }
    return out;
  }

  /** Return RPC URL for the given layer, respecting env overrides. */
  static rpcFor(layer: GhostLayer): string {
    return _registry.get(layer)?.rpc ?? GhostNetworks[layer].rpc;
  }

  /** Derive the full ancestry chain for a given layer (L3 → [L3, L2, L1]). */
  static ancestry(layer: GhostLayer): GhostLayer[] {
    const path: GhostLayer[] = [layer];
    let current: GhostLayer | null = layer;
    while ((current = parentLayer(current)) !== null) {
      path.push(current);
    }
    return path;
  }

  // ── Instance API ──────────────────────────────────────────────────────────

  private _local = new Map<string, GhostNetworkConfig>([..._registry]);

  register(id: string, config: GhostNetworkConfig): this {
    this._local.set(id, config);
    return this;
  }

  get(id: string): GhostNetworkConfig | undefined {
    return this._local.get(id);
  }

  all(): GhostNetworkConfig[] {
    return [...this._local.values()];
  }

  rpcFor(layer: GhostLayer): string {
    return this._local.get(layer)?.rpc ?? GhostNetworks[layer].rpc;
  }
}

/** Singleton convenience instance. */
export const ghostNetworkRegistry = new GhostNetworkRegistry();
