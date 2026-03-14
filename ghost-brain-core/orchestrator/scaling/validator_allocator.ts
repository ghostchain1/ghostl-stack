/**
 * GhostBrain Global Orchestrator — Validator Allocator
 *
 * Assigns validator nodes to regions following the GhostChain settlement hierarchy:
 *
 *   L3 validators settle to L2.
 *   L2 validators settle to L1 (GhostChain).
 *   L1 validators participate in CometBFT consensus on GhostChain.
 *
 * Allocation strategy:
 *   1. Prefer regions with lowest measured latency (from RegionIndex).
 *   2. Distribute validators across regions for fault-tolerance
 *      (no single region should hold >50% of validators).
 *   3. Enforce minimum validator count per chain layer.
 *
 * Returns an ordered list of GhostNodes assigned as validators.
 * Does NOT start nodes or modify chain configuration autonomously.
 */

import type { GhostNode, ChainId } from "../types.js";
import type { NodeRegistry }        from "../discovery/node_registry.js";
import type { RegionIndex }         from "../discovery/region_index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum validators required per layer before alerting. */
const MIN_VALIDATORS: Record<ChainId, number> = {
  14000101: parseInt(process.env["MIN_VALIDATORS_L1"] ?? "4", 10),
  901:      parseInt(process.env["MIN_VALIDATORS_L2"] ?? "2", 10),
  903:      parseInt(process.env["MIN_VALIDATORS_L3"] ?? "2", 10),
};

/**
 * Maximum fraction of total validators that one region may hold.
 * 0.5 = no single region gets more than half.
 */
const MAX_REGION_FRACTION = parseFloat(
  process.env["VALIDATOR_MAX_REGION_FRACTION"] ?? "0.5",
);

// ---------------------------------------------------------------------------
// ValidatorAllocator
// ---------------------------------------------------------------------------

export interface ValidatorAssignment {
  chainId:    ChainId;
  validators: GhostNode[];
  /** Regions that have fewer validators than desirable. */
  underservedRegions: string[];
  satisfiesMinimum:   boolean;
  allocatedAt:        number;
}

export class ValidatorAllocator {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly regionIndex: RegionIndex,
  ) {}

  /**
   * Allocate validators for a specific chain layer.
   *
   * Validators are selected from healthy nodes with role="validator"
   * and a matching chainId, distributed across regions to maximise
   * fault-isolation.
   */
  allocate(chainId: ChainId): ValidatorAssignment {
    const now = Date.now();

    // All healthy validators for this chain, across all regions.
    const candidates = this.registry
      .getByRole("validator")
      .filter(n => n.chainId === chainId && n.status === "healthy");

    if (candidates.length === 0) {
      return {
        chainId,
        validators:         [],
        underservedRegions: [],
        satisfiesMinimum:   false,
        allocatedAt:        now,
      };
    }

    // Group by region.
    const byRegion = new Map<string, GhostNode[]>();
    for (const node of candidates) {
      if (!byRegion.has(node.region)) byRegion.set(node.region, []);
      byRegion.get(node.region)!.push(node);
    }

    // Sort regions by latency (ascending) using RegionIndex.
    const rankedRegions = this.regionIndex.rankedRegions();
    const selected: GhostNode[]  = [];
    const underserved: string[]  = [];

    const maxPerRegion = Math.floor(
      candidates.length * MAX_REGION_FRACTION,
    );

    for (const info of rankedRegions) {
      const regionNodes = byRegion.get(info.id) ?? [];
      if (regionNodes.length === 0) continue;

      // Sort within region: lowest load first.
      regionNodes.sort((a, b) => a.loadPct - b.loadPct);

      const take = regionNodes.slice(0, Math.max(1, maxPerRegion));
      selected.push(...take);

      if (regionNodes.length < 2) {
        underserved.push(info.id);
      }
    }

    const minRequired  = MIN_VALIDATORS[chainId];
    const satisfies    = selected.length >= minRequired;

    if (!satisfies) {
      console.warn(
        `[validator-allocator] chainId=${chainId}: only ${selected.length} ` +
        `validators allocated, minimum is ${minRequired}`,
      );
    }

    return {
      chainId,
      validators:          selected,
      underservedRegions:  underserved,
      satisfiesMinimum:    satisfies,
      allocatedAt:         now,
    };
  }

  /** Allocate validators for all three chain layers. */
  allocateAll(): ValidatorAssignment[] {
    const chainIds: ChainId[] = [14000101, 901, 903];
    return chainIds.map(id => this.allocate(id));
  }
}
