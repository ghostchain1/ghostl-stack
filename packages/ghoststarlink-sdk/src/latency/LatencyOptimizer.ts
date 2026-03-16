/**
 * LatencyOptimizer — Satellite Link QoS Tuning for GhostStarlink
 *
 * Measures per-node latency, maintains rolling statistics, reorders
 * connections by inferred quality, and schedules block submissions
 * during low-latency satellite windows.
 */

export interface LatencyStats {
  nodeId:      string;
  sampleCount: number;
  minMs:       number;
  maxMs:       number;
  avgMs:       number;
  p50Ms:       number;
  p95Ms:       number;
  jitterMs:    number;       // std-dev
  quality:     'excellent' | 'good' | 'degraded' | 'poor' | 'offline';
}

export interface ConnectionScore {
  nodeId:    string;
  score:     number;         // lower = better
  rank:      number;
  stats:     LatencyStats;
}

export interface BlockWindow {
  nodeId:          string;
  suggestedDelayMs: number;  // wait this long before submitting
  reason:          string;
}

export interface OptimizerConfig {
  /** Number of samples per measurement round */
  sampleCount?:      number;
  /** Thresholds for quality tiers */
  thresholds?: {
    excellentMs?: number;
    goodMs?:      number;
    degradedMs?:  number;
    poorMs?:      number;
  };
  /** Adaptive window: target block propagation latency in ms */
  targetPropLatencyMs?: number;
}

const QUALITY_THRESHOLDS = {
  excellentMs: 80,
  goodMs:      250,
  degradedMs:  600,
  poorMs:      1500,
};

// ─── LatencyOptimizer ─────────────────────────────────────────────────────────

export class LatencyOptimizer {
  private samples:  Map<string, number[]> = new Map();
  private cfg:      Required<OptimizerConfig>;

  constructor(config: OptimizerConfig = {}) {
    this.cfg = {
      sampleCount:          config.sampleCount          ?? 10,
      thresholds:           { ...QUALITY_THRESHOLDS, ...config.thresholds },
      targetPropLatencyMs:  config.targetPropLatencyMs  ?? 400,
    };
  }

  /**
   * Measure round-trip latency to a node's RPC endpoint.
   * Uses `ghost_blockNumber` as a lightweight ping via the target endpoint.
   *
   * @param nodeId     Identifier for later retrieval
   * @param rpcUrl     The endpoint to probe
   * @param samples    How many probes to run (default: config.sampleCount)
   */
  async measure(nodeId: string, rpcUrl: string, samples?: number): Promise<LatencyStats> {
    const n = samples ?? this.cfg.sampleCount;
    const rtt: number[] = [];

    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      try {
        await fetch(rpcUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ghost_blockNumber', params: [] }),
          signal:  AbortSignal.timeout(5000),
        });
      } catch {
        // Count as high-latency failure rather than break — keeps stats robust
        rtt.push(5000);
        continue;
      }
      rtt.push(performance.now() - t0);
    }

    const stats = this.buildStats(nodeId, rtt);
    this.samples.set(nodeId, [...(this.samples.get(nodeId) ?? []), ...rtt]);
    return stats;
  }

  /**
   * Push externally measured latency samples (e.g. from StarlinkAdapter probes).
   */
  recordSamples(nodeId: string, rtts: number[]): LatencyStats {
    const existing = this.samples.get(nodeId) ?? [];
    this.samples.set(nodeId, [...existing, ...rtts]);
    return this.buildStats(nodeId, this.samples.get(nodeId)!);
  }

  /**
   * Get cached latency stats for a node without re-measuring.
   */
  getStats(nodeId: string): LatencyStats | null {
    const s = this.samples.get(nodeId);
    if (!s || s.length === 0) return null;
    return this.buildStats(nodeId, s);
  }

  /**
   * Reorder connections by inferred quality (best first).
   */
  optimize(nodeIds: string[]): ConnectionScore[] {
    const scored: ConnectionScore[] = nodeIds.map(id => {
      const s = this.samples.get(id);
      if (!s || s.length === 0) {
        return {
          nodeId: id,
          score:  Infinity,
          rank:   0,
          stats:  this.buildStats(id, [5000]),
        };
      }
      const stats = this.buildStats(id, s);
      return {
        nodeId: id,
        score:  stats.p95Ms + stats.jitterMs * 0.5,
        rank:   0,
        stats,
      };
    });

    scored.sort((a, b) => a.score - b.score);
    scored.forEach((c, i) => { c.rank = i + 1; });
    return scored;
  }

  /**
   * Compute the best submission delay for block propagation.
   *
   * If a node has high latency, the delay is increased so that the block
   * arrives at a consistent phase relative to the next GhostChain L2 slot.
   */
  adaptiveWindow(nodeId: string, slotDurationMs = 2000): BlockWindow {
    const stats = this.getStats(nodeId);

    if (!stats || stats.quality === 'offline') {
      return {
        nodeId,
        suggestedDelayMs: slotDurationMs,
        reason:           'Node offline — full slot delay applied',
      };
    }

    const surplus = this.cfg.targetPropLatencyMs - stats.p95Ms;
    let delay = 0;

    if (surplus < 0) {
      // Node is too slow — push back by one slot to avoid stale submissions
      delay = slotDurationMs + Math.abs(surplus);
    } else if (stats.quality === 'excellent') {
      delay = 0;   // submit immediately
    } else {
      delay = Math.max(0, Math.round(stats.p50Ms * 0.5));
    }

    return {
      nodeId,
      suggestedDelayMs: delay,
      reason:           `quality=${stats.quality}, p95=${stats.p95Ms.toFixed(0)}ms`,
    };
  }

  /**
   * Schedule a task on the connection with the lowest current latency.
   * Returns the winning node ID and executes the callback.
   */
  async scheduleForLowLatency<T>(
    nodeIds: string[],
    task: (nodeId: string) => Promise<T>,
  ): Promise<{ nodeId: string; result: T }> {
    const ranked = this.optimize(nodeIds);
    const best   = ranked[0];
    if (!best) throw new Error('LatencyOptimizer: no nodes available');

    const result = await task(best.nodeId);
    return { nodeId: best.nodeId, result };
  }

  /**
   * Evict all samples for a node (e.g. it was removed from the mesh).
   */
  clearNode(nodeId: string): void {
    this.samples.delete(nodeId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private buildStats(nodeId: string, rtts: number[]): LatencyStats {
    if (rtts.length === 0) {
      return { nodeId, sampleCount: 0, minMs: 0, maxMs: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, jitterMs: 0, quality: 'offline' };
    }

    const sorted = [...rtts].sort((a, b) => a - b);
    const avg    = rtts.reduce((s, v) => s + v, 0) / rtts.length;
    const variance = rtts.reduce((s, v) => s + (v - avg) ** 2, 0) / rtts.length;

    const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    const thr = { ...QUALITY_THRESHOLDS, ...this.cfg.thresholds };

    let quality: LatencyStats['quality'];
    if (p95 >= 5000)                quality = 'offline';
    else if (p95 <= thr.excellentMs) quality = 'excellent';
    else if (p95 <= thr.goodMs)      quality = 'good';
    else if (p95 <= thr.degradedMs)  quality = 'degraded';
    else if (p95 <= thr.poorMs)      quality = 'poor';
    else                             quality = 'offline';

    return {
      nodeId,
      sampleCount: rtts.length,
      minMs:   sorted[0]!,
      maxMs:   sorted[sorted.length - 1]!,
      avgMs:   Math.round(avg * 10) / 10,
      p50Ms:   Math.round(p50),
      p95Ms:   Math.round(p95),
      jitterMs: Math.round(Math.sqrt(variance) * 10) / 10,
      quality,
    };
  }
}
