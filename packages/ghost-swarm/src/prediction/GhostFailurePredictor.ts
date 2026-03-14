import type { FailureHistory } from '../types.js';

export type DegradationLevel = 'none' | 'minor' | 'service-degradation' | 'critical';

/**
 * GhostFailurePredictor — analyses historical error data to predict service
 * degradation before it becomes an outage.
 *
 * Uses a simple threshold model; this can be swapped for a time-series ML model
 * without changing the public interface.
 */
export class GhostFailurePredictor {
  private readonly minorThreshold: number;
  private readonly degradationThreshold: number;
  private readonly criticalThreshold: number;

  constructor(opts: {
    minorThreshold?: number;
    degradationThreshold?: number;
    criticalThreshold?: number;
  } = {}) {
    this.minorThreshold = opts.minorThreshold ?? 10;
    this.degradationThreshold = opts.degradationThreshold ?? 50;
    this.criticalThreshold = opts.criticalThreshold ?? 200;
  }

  async analyze(history: FailureHistory): Promise<DegradationLevel> {
    if (history.errors >= this.criticalThreshold) return 'critical';
    if (history.errors >= this.degradationThreshold) return 'service-degradation';
    if (history.errors >= this.minorThreshold) return 'minor';
    return 'none';
  }

  /** Combine error and restart counts for a composite health score (0 = perfect). */
  healthScore(history: FailureHistory): number {
    return history.errors + history.restarts * 5 + history.latencySpikes * 2;
  }
}
