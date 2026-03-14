import type { PredictionMetrics } from '../types.js';

export type PredictionResult =
  | 'disk-failure-risk'
  | 'overload-risk'
  | 'memory-pressure-risk'
  | 'network-saturation-risk'
  | 'healthy';

/**
 * GhostPredictiveEngine — analyses real-time infrastructure metrics and flags
 * failure risks before they occur.
 *
 * Thresholds are configurable via constructor options so they can be tuned per
 * environment without code changes.
 */
export class GhostPredictiveEngine {
  private readonly diskThreshold: number;
  private readonly cpuThreshold: number;
  private readonly memoryThreshold: number;
  private readonly errorRateThreshold: number;

  constructor(opts: {
    diskThreshold?: number;
    cpuThreshold?: number;
    memoryThreshold?: number;
    errorRateThreshold?: number;
  } = {}) {
    this.diskThreshold = opts.diskThreshold ?? 90;
    this.cpuThreshold = opts.cpuThreshold ?? 95;
    this.memoryThreshold = opts.memoryThreshold ?? 90;
    this.errorRateThreshold = opts.errorRateThreshold ?? 20;
  }

  /**
   * Return the most critical predicted risk for the given metrics snapshot,
   * or 'healthy' if all signals are within safe bounds.
   */
  predict(metrics: PredictionMetrics): PredictionResult {
    if (metrics.disk > this.diskThreshold) return 'disk-failure-risk';
    if (metrics.cpu > this.cpuThreshold) return 'overload-risk';
    if (metrics.memory > this.memoryThreshold) return 'memory-pressure-risk';
    if (metrics.errorRate > this.errorRateThreshold) return 'network-saturation-risk';
    return 'healthy';
  }

  /** Return all active risks for a metrics snapshot (not just the most critical). */
  predictAll(metrics: PredictionMetrics): PredictionResult[] {
    const risks: PredictionResult[] = [];
    if (metrics.disk > this.diskThreshold) risks.push('disk-failure-risk');
    if (metrics.cpu > this.cpuThreshold) risks.push('overload-risk');
    if (metrics.memory > this.memoryThreshold) risks.push('memory-pressure-risk');
    if (metrics.errorRate > this.errorRateThreshold) risks.push('network-saturation-risk');
    return risks.length > 0 ? risks : ['healthy'];
  }
}
