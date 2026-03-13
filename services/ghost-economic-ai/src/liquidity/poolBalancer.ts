/**
 * Pool Balancer
 *
 * Computes pool rebalancing recommendations for GhostXchange (the GhostChain DEX).
 * A pool is considered imbalanced when the dominant token's fraction exceeds
 * AEE_LIQUIDITY_IMBALANCE_THRESHOLD beyond 50/50 equilibrium.
 *
 * Produces advisory proposals only — never executes swaps directly.
 */

import { type PoolState } from '../types.js';

const IMBALANCE_THRESHOLD = Number(process.env.AEE_LIQUIDITY_IMBALANCE_THRESHOLD ?? 0.15);

export interface PoolAssessment {
  poolId:       string;
  balanced:     boolean;
  ratio:        number;
  imbalancePct: number;
  suggestedSwapGst: number;
  direction:    'add_token0' | 'add_token1' | 'balanced';
}

/** Assess a single pool and return a rebalancing recommendation. */
export function assessPool(pool: PoolState): PoolAssessment {
  const deviation  = Math.abs(pool.ratio - 0.5);
  const balanced   = deviation <= IMBALANCE_THRESHOLD;
  const imbalancePct = deviation * 200; // as percentage from 50/50

  // Amount of GST-equivalent liquidity to add to the thin side
  const suggestedSwapGst = balanced ? 0 : (pool.tvlGst * deviation * 0.5);

  let direction: PoolAssessment['direction'];
  if (balanced)         direction = 'balanced';
  else if (pool.ratio > 0.5) direction = 'add_token1';
  else                       direction = 'add_token0';

  return { poolId: pool.poolId, balanced, ratio: pool.ratio, imbalancePct, suggestedSwapGst, direction };
}

/** Assess all pools and return those needing attention. */
export function assessPools(pools: PoolState[]): PoolAssessment[] {
  return pools.map(assessPool).filter((a) => !a.balanced);
}
