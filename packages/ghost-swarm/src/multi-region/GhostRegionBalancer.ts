import type { Region, RoutingRequest } from '../types.js';

// Forward reference to avoid circular import — the controller passes itself in.
export interface IRegionSource {
  healthyRegions(): Region[];
}

/**
 * GhostRegionBalancer — routes workloads to the optimal healthy region.
 *
 * Default strategy: lowest-latency among healthy regions. Falls back to least-loaded
 * when latency values are equal, and to any available region when all else fails.
 */
export class GhostRegionBalancer {
  private readonly source: IRegionSource;

  constructor(source: IRegionSource) {
    this.source = source;
  }

  /**
   * Select the best region for a request. Returns undefined when no healthy region
   * is available (callers should surface this as an error rather than forwarding
   * to an unhealthy target).
   */
  route(_request: RoutingRequest): Region | undefined {
    const healthy = this.source.healthyRegions();
    if (healthy.length === 0) return undefined;

    // Primary: lowest latency
    return healthy.reduce((best, r) => {
      if (r.latencyMs < best.latencyMs) return r;
      if (r.latencyMs === best.latencyMs && r.load < best.load) return r;
      return best;
    });
  }

  routeId(request: RoutingRequest): string {
    return this.route(request)?.id ?? 'no-healthy-region';
  }

  /** Rank all healthy regions by (latency ASC, load ASC). */
  ranked(): Region[] {
    return [...this.source.healthyRegions()].sort((a, b) =>
      a.latencyMs !== b.latencyMs ? a.latencyMs - b.latencyMs : a.load - b.load,
    );
  }
}
