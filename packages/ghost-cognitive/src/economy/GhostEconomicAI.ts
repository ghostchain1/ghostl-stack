import type { EconomicMetrics } from '../types.js';

export type EconomicRecommendation =
  | 'increase liquidity incentives'
  | 'optimize gas'
  | 'reduce validator rewards'
  | 'increase validator rewards'
  | 'maintain current strategy'
  | 'emergency stabilization';

/**
 * GhostEconomicAI — evaluates real-time economic metrics and produces strategic
 * recommendations for the treasury and fee subsystems.
 *
 * Thresholds are fully configurable; defaults reflect typical DeFi operational
 * targets for a sovereign L1/L2 stack.
 */
export class GhostEconomicAI {
  private readonly tvlGrowthMin: number;
  private readonly gasFeeMax: number;

  constructor(opts: { tvlGrowthMin?: number; gasFeeMax?: number } = {}) {
    this.tvlGrowthMin = opts.tvlGrowthMin ?? 2;
    this.gasFeeMax = opts.gasFeeMax ?? 2;
  }

  evaluate(metrics: EconomicMetrics): EconomicRecommendation {
    if (metrics.tvlGrowth < this.tvlGrowthMin) return 'increase liquidity incentives';
    if (metrics.gasFees > this.gasFeeMax) return 'optimize gas';
    if (metrics.transactionVolume < 100) return 'increase validator rewards';
    if (metrics.bridgeLiquidity < 0.1 * metrics.treasuryBalance) return 'increase liquidity incentives';
    return 'maintain current strategy';
  }

  /** Score the health of the economy on a 0–100 scale. */
  healthScore(metrics: EconomicMetrics): number {
    let score = 100;
    if (metrics.tvlGrowth < this.tvlGrowthMin) score -= 25;
    if (metrics.gasFees > this.gasFeeMax) score -= 20;
    if (metrics.bridgeLiquidity < 0.05 * metrics.treasuryBalance) score -= 30;
    if (metrics.transactionVolume < 10) score -= 25;
    return Math.max(0, score);
  }
}
