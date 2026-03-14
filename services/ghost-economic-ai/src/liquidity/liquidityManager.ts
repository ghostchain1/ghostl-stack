/**
 * Liquidity Manager
 *
 * Monitors GhostXchange DEX pool states and submits advisory liquidity
 * re-balancing proposals when pools drift beyond the imbalance threshold.
 *
 * Pool state is read from:
 *   1. On-chain via ghost_call to the GhostXchange PoolRegistry (when configured).
 *   2. Fallback: static initial pool configuration from env (for bootstrapping).
 *
 * Proposals go to the signing relay — never executed inline.
 */

import { type PoolState, type EconomicProposal, type Allocation } from '../types.js';
import { submitProposal }                                          from '../proposals.js';
import { assessPools }                                             from './poolBalancer.js';

// Cooldown between liquidity proposals per pool
const COOLDOWN_MS = Number(process.env.AEE_LIQ_COOLDOWN_MIN ?? 45) * 60_000;
const _lastProposal: Map<string, number> = new Map();

// ── Placeholder pool state ─────────────────────────────────────────────────────
// When GhostXchange is live these will be fetched on-chain via ghost_call.
// For now we expose hooks that server.ts can override by calling setPoolStates().
let _pools: PoolState[] = [
  {
    poolId:   'GST-USDT',
    token0:   'GST',
    token1:   'USDT',
    reserve0: 1_000_000,
    reserve1: 1_000_000,
    ratio:    0.5,
    tvlGst:   2_000_000,
    ts:       Date.now(),
  },
  {
    poolId:   'GST-wGHOST',
    token0:   'GST',
    token1:   'wGHOST',
    reserve0: 500_000,
    reserve1: 500_000,
    ratio:    0.5,
    tvlGst:   1_000_000,
    ts:       Date.now(),
  },
];

/** Override pool states from an on-chain data source. */
export function setPoolStates(pools: PoolState[]): void {
  _pools = pools;
}

/** Return current pool states (read-only snapshot). */
export function getPoolStates(): PoolState[] {
  return _pools.map((p) => ({ ...p }));
}

/**
 * Evaluate all pools and submit proposals for imbalanced ones.
 * Returns an array of proposals submitted (may be empty).
 */
export async function assessLiquidity(
  _allocation?: Allocation
): Promise<EconomicProposal[]> {
  const imbalanced = assessPools(_pools);
  if (imbalanced.length === 0) return [];

  const submitted: EconomicProposal[] = [];
  const now = Date.now();

  for (const assessment of imbalanced) {
    const last = _lastProposal.get(assessment.poolId) ?? 0;
    if (now - last < COOLDOWN_MS) continue;

    const proposal: EconomicProposal = {
      id:        `aee-liq-${assessment.poolId}-${now}`,
      ts:        now,
      source:    'ghost-economic-ai',
      target:    'liquidity',
      action:    `rebalance_pool_${assessment.direction}`,
      amountGst: assessment.suggestedSwapGst,
      reason:    `Pool ${assessment.poolId} ratio=${(assessment.ratio * 100).toFixed(1)}% ` +
                 `(deviation=${assessment.imbalancePct.toFixed(1)}%)`,
      advisory:  true,
      metadata:  {
        poolId:            assessment.poolId,
        currentRatio:      assessment.ratio,
        suggestedSwapGst:  assessment.suggestedSwapGst.toFixed(0),
        direction:         assessment.direction,
        imbalancePct:      assessment.imbalancePct.toFixed(2),
      },
    };

    await submitProposal(proposal);
    _lastProposal.set(assessment.poolId, now);
    submitted.push(proposal);

    console.log(`[AEE:liquidity] pool ${assessment.poolId} imbalanced — proposal submitted`);
  }

  return submitted;
}
