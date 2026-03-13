/**
 * Staking Optimizer
 *
 * Analyzes validator participation and computes reward adjustment
 * recommendations. Uses the current validator metrics to determine
 * whether GST staking incentives should be increased or decreased.
 *
 * All recommendations are returned as plain objects — proposal submission
 * happens in validatorRewards.ts.
 */

import { type ValidatorMetrics } from '../types.js';

const MIN_PARTICIPATION  = Number(process.env.AEE_VALIDATOR_MIN_PARTICIPATION  ?? 0.80);
const MAX_PARTICIPATION  = Number(process.env.AEE_VALIDATOR_MAX_PARTICIPATION  ?? 0.95);

export type RewardDirection = 'increase' | 'decrease' | 'hold';

export interface StakingRecommendation {
  direction:       RewardDirection;
  adjustmentPct:   number;               // positive = increase, negative = decrease
  reason:          string;
  participationPct: number;
}

/**
 * Compute a reward adjustment given current validator metrics.
 *
 * Logic:
 *   < MIN_PARTICIPATION → increase rewards to attract more validators
 *   > MAX_PARTICIPATION → slight decrease to improve reward efficiency
 *   within band          → hold
 */
export function computeStakingRecommendation(
  metrics: ValidatorMetrics
): StakingRecommendation {
  const p = metrics.participationRate;

  if (p < MIN_PARTICIPATION) {
    const deficit = MIN_PARTICIPATION - p;
    // Scale adjustment: 5–20% increase depending on deficit magnitude
    const adjustmentPct = Math.min(20, Math.round(deficit / MIN_PARTICIPATION * 100));
    return {
      direction:       'increase',
      adjustmentPct:   +adjustmentPct,
      reason:          `Participation ${(p * 100).toFixed(1)}% is below minimum ` +
                       `${(MIN_PARTICIPATION * 100).toFixed(0)}%`,
      participationPct: p * 100,
    };
  }

  if (p > MAX_PARTICIPATION) {
    // Gentle reduction — don't destabilise an over-performing network
    const adjustmentPct = -5;
    return {
      direction:       'decrease',
      adjustmentPct,
      reason:          `Participation ${(p * 100).toFixed(1)}% exceeds target ` +
                       `${(MAX_PARTICIPATION * 100).toFixed(0)}% — marginal efficiency reduction`,
      participationPct: p * 100,
    };
  }

  return {
    direction:       'hold',
    adjustmentPct:   0,
    reason:          `Participation ${(p * 100).toFixed(1)}% within target band`,
    participationPct: p * 100,
  };
}
