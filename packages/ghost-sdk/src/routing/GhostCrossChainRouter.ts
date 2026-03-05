/**
 * GhostCrossChainRouter
 *
 * Automatic multi-hop cross-chain routing for GhostStack.
 *
 * GhostStack hierarchy: L3 → L2 → L1
 *
 * The router resolves the minimal hop path between any two layers,
 * validates the route, and returns ordered bridge steps.
 *
 * Usage:
 *   const router = new GhostCrossChainRouter();
 *   const route  = router.resolveRoute("L3", "L1");
 *   // route.hops → ["L3","L2","L1"]
 *   // route.bridges → ["L3_TO_L2","L2_TO_L1"]
 */

import type { GhostLayer } from "../networks.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BridgeHop = "L3_TO_L2" | "L2_TO_L1" | "L3_TO_L1" | "L1_TO_L2" | "L2_TO_L3";

export interface RouteResult {
  /** Ordered list of layers traversed */
  hops: GhostLayer[];
  /** Bridge operations required for each hop */
  bridges: BridgeHop[];
  /** Total number of cross-chain hops */
  hopCount: number;
  /** Whether this route crosses all three layers */
  isThreeLayer: boolean;
  /** Human-readable description */
  description: string;
}

export interface RouterConfig {
  /**
   * Whether to prefer direct L3→L1 bridge if available rather than
   * routing via L2. Default: false (always go via L2 for proven path).
   */
  allowDirectL3toL1?: boolean;
}

// ── Layer adjacency graph ─────────────────────────────────────────────────────

/** GhostStack derivation order: L1 is parent of L2, L2 is parent of L3 */
const LAYER_RANK: Record<GhostLayer, number> = { L1: 1, L2: 2, L3: 3 };

// ── GhostCrossChainRouter ─────────────────────────────────────────────────────

export class GhostCrossChainRouter {
  private readonly allowDirectL3toL1: boolean;

  constructor(config: RouterConfig = {}) {
    this.allowDirectL3toL1 = config.allowDirectL3toL1 ?? false;
  }

  /**
   * Resolve the route from `origin` to `destination`.
   *
   * Examples:
   *   resolveRoute("L3","L1") → hops: [L3,L2,L1], bridges: [L3_TO_L2, L2_TO_L1]
   *   resolveRoute("L2","L1") → hops: [L2,L1],    bridges: [L2_TO_L1]
   *   resolveRoute("L1","L2") → hops: [L1,L2],    bridges: [L1_TO_L2]
   *   resolveRoute("L2","L2") → same-layer (no bridge)
   */
  resolveRoute(origin: GhostLayer, destination: GhostLayer): RouteResult {
    if (origin === destination) {
      return {
        hops:         [origin],
        bridges:      [],
        hopCount:     0,
        isThreeLayer: false,
        description:  `Same-layer execution on ${origin} — no bridge required`,
      };
    }

    const hops    = this._computeHops(origin, destination);
    const bridges = this._deriveBridges(hops);

    return {
      hops,
      bridges,
      hopCount:     hops.length - 1,
      isThreeLayer: hops.length === 3,
      description:  `${hops.join(" → ")} via ${bridges.join(", ")}`,
    };
  }

  /**
   * Resolve multiple routes at once (e.g. for a swap that needs deposits on two layers).
   */
  resolveAll(pairs: Array<[GhostLayer, GhostLayer]>): RouteResult[] {
    return pairs.map(([from, to]) => this.resolveRoute(from, to));
  }

  /**
   * Check whether a given path is valid within GhostStack rules.
   */
  isValidRoute(hops: GhostLayer[]): boolean {
    for (let i = 0; i < hops.length - 1; i++) {
      const diff = Math.abs(LAYER_RANK[hops[i]] - LAYER_RANK[hops[i + 1]]);
      if (diff !== 1 && !(this.allowDirectL3toL1 && diff === 2)) return false;
    }
    return true;
  }

  /**
   * Return the parent layer for a given layer in the derivation chain.
   * L3 → L2, L2 → L1, L1 → null
   */
  parentOf(layer: GhostLayer): GhostLayer | null {
    if (layer === "L3") return "L2";
    if (layer === "L2") return "L1";
    return null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _computeHops(origin: GhostLayer, destination: GhostLayer): GhostLayer[] {
    const originRank = LAYER_RANK[origin];
    const destRank   = LAYER_RANK[destination];

    // Going up (L3→L1 or L2→L1): standard derivation path
    if (originRank > destRank) {
      if (origin === "L3" && destination === "L1" && this.allowDirectL3toL1) {
        return ["L3", "L1"];
      }
      // Full path via intermediate layers
      const path: GhostLayer[] = [];
      for (let r = originRank; r >= destRank; r--) {
        path.push(this._rankToLayer(r));
      }
      return path;
    }

    // Going down (L1→L2 or L1→L3 or L2→L3): deposit path
    const path: GhostLayer[] = [];
    for (let r = originRank; r <= destRank; r++) {
      path.push(this._rankToLayer(r));
    }
    return path;
  }

  private _deriveBridges(hops: GhostLayer[]): BridgeHop[] {
    const bridges: BridgeHop[] = [];
    for (let i = 0; i < hops.length - 1; i++) {
      const from = hops[i];
      const to   = hops[i + 1];
      bridges.push(`${from}_TO_${to}` as BridgeHop);
    }
    return bridges;
  }

  private _rankToLayer(rank: number): GhostLayer {
    if (rank === 1) return "L1";
    if (rank === 2) return "L2";
    return "L3";
  }
}

/** Singleton instance for convenience use across the SDK. */
export const ghostCrossChainRouter = new GhostCrossChainRouter();
