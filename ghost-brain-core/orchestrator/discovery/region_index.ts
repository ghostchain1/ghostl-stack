/**
 * GhostBrain Global Orchestrator — Region Index
 *
 * A fast secondary lookup table keyed by region ID that provides:
 *   - Average latency for a region (updated by LatencyMonitor).
 *   - Ranked list of regions by latency (lowest first).
 *   - Per-region node counts and health ratios.
 *
 * Works as a computed view over NodeRegistry data — updates are driven
 * by RegionManager check() results rather than by direct mutation.
 */

import type { GhostNode, RegionInfo } from "../types.js";
import type { NodeRegistry }           from "./node_registry.js";

// ---------------------------------------------------------------------------
// RegionIndex
// ---------------------------------------------------------------------------

export class RegionIndex {
  private readonly latencyCache = new Map<string, number>();

  constructor(private readonly registry: NodeRegistry) {}

  /**
   * Refresh the latency cache for a region using its current node set.
   * Called by LatencyMonitor after each probe cycle.
   */
  updateLatency(regionId: string, avgLatencyMs: number): void {
    this.latencyCache.set(regionId, avgLatencyMs);
  }

  /**
   * Return all known regions sorted by average latency (lowest first).
   * Regions with no latency measurement sort last.
   */
  rankedRegions(): RegionInfo[] {
    const regionIds = this.allRegionIds();

    return regionIds
      .map(id => this.buildInfo(id))
      .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
  }

  /**
   * Returns the lowest-latency region that has at least one healthy node
   * with the given role.
   */
  bestRegionFor(role: string): RegionInfo | null {
    const ranked = this.rankedRegions();
    for (const info of ranked) {
      const nodes = this.registry.getByRegion(info.id);
      const hasRole = nodes.some(n => n.role === role && n.status === "healthy");
      if (hasRole) return info;
    }
    return null;
  }

  /** Snapshot of a single region. */
  get(regionId: string): RegionInfo | null {
    if (!this.allRegionIds().includes(regionId)) return null;
    return this.buildInfo(regionId);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private allRegionIds(): string[] {
    const ids = new Set<string>();
    for (const node of this.registry.getAll()) {
      ids.add(node.region);
    }
    return [...ids];
  }

  private buildInfo(regionId: string): RegionInfo {
    const nodes    = this.registry.getByRegion(regionId);
    const healthy  = nodes.filter(n => n.status === "healthy").length;
    const avgLat   = this.latencyCache.get(regionId) ?? this.computeAvgLatency(nodes);

    const l1 = nodes.find(n => n.role === "l1");
    const l2 = nodes.find(n => n.role === "l2");
    const l3 = nodes.find(n => n.role === "l3");

    return {
      id:             regionId,
      name:           regionId,
      primaryL1Host:  l1?.host ?? "",
      primaryL2Host:  l2?.host ?? "",
      primaryL3Host:  l3?.host ?? "",
      avgLatencyMs:   Math.round(avgLat),
      nodeCount:      nodes.length,
      healthyCount:   healthy,
      lastCheckedAt:  Date.now(),
    };
  }

  private computeAvgLatency(nodes: GhostNode[]): number {
    if (!nodes.length) return Number.MAX_SAFE_INTEGER;
    return nodes.reduce((s, n) => s + n.latencyMs, 0) / nodes.length;
  }
}
