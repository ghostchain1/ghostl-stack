import type { TreasuryAllocation } from '../types.js';

/**
 * GhostTreasuryStrategist — computes optimal allocation of treasury funds
 * across operational buckets.
 *
 * Default split: 40 % validators, 30 % development, 20 % liquidity, 10 % reserve.
 * Allocation weights are configurable so governance can adjust them via proposal.
 */
export class GhostTreasuryStrategist {
  private weights: { validators: number; development: number; liquidity: number; reserve: number };

  constructor(weights?: Partial<{ validators: number; development: number; liquidity: number; reserve: number }>) {
    const raw = {
      validators: weights?.validators ?? 0.4,
      development: weights?.development ?? 0.3,
      liquidity: weights?.liquidity ?? 0.2,
      reserve: weights?.reserve ?? 0.1,
    };

    // Normalise so weights always sum to 1
    const total = raw.validators + raw.development + raw.liquidity + raw.reserve;
    this.weights = {
      validators: raw.validators / total,
      development: raw.development / total,
      liquidity: raw.liquidity / total,
      reserve: raw.reserve / total,
    };
  }

  allocate(funds: number): TreasuryAllocation {
    return {
      validators: funds * this.weights.validators,
      development: funds * this.weights.development,
      liquidity: funds * this.weights.liquidity,
      reserve: funds * this.weights.reserve,
    };
  }

  /** Adjust weights in response to a governance proposal. */
  updateWeights(newWeights: Partial<{ validators: number; development: number; liquidity: number; reserve: number }>): void {
    const merged = {
      validators: newWeights.validators ?? this.weights.validators,
      development: newWeights.development ?? this.weights.development,
      liquidity: newWeights.liquidity ?? this.weights.liquidity,
      reserve: newWeights.reserve ?? this.weights.reserve,
    };
    const total = merged.validators + merged.development + merged.liquidity + merged.reserve;
    this.weights = {
      validators: merged.validators / total,
      development: merged.development / total,
      liquidity: merged.liquidity / total,
      reserve: merged.reserve / total,
    };
  }

  currentWeights() {
    return { ...this.weights };
  }
}
