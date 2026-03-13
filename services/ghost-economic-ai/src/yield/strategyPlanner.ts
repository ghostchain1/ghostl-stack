/**
 * Strategy Planner
 *
 * Evaluates available yield strategies and selects the optimal one based on
 * risk-adjusted APR and current market conditions.
 *
 * Strategies are configured via AEE_YIELD_STRATEGIES (comma-separated IDs).
 * Default strategies are L1-native (GhostChain staking, GhostXchange LP,
 * L1 lending reserve).
 *
 * External-chain strategies (e.g. cross-chain bridges to other ecosystems)
 * are represented as advisory proposals only — GhostChain L1 is the sole
 * actor for any external interactions, and all executions require governance
 * ratification via the signing relay.
 */

import { type YieldStrategy, type MarketMetrics } from '../types.js';

const ENABLED_IDS  = (process.env.AEE_YIELD_STRATEGIES ?? 'ghostchain-staking,ghostxchange-lp').split(',').map((s) => s.trim());
const MIN_APY      = Number(process.env.AEE_YIELD_MIN_APY ?? 0.05); // 5% floor

/** All known yield strategies with their configured risk/reward profiles. */
const KNOWN_STRATEGIES: YieldStrategy[] = [
  {
    id:          'ghostchain-staking',
    description: 'Delegate treasury GST to the GhostChain validator pool',
    aprPct:      8.0,
    riskLevel:   'low',
    maxCapGst:   20_000_000,
  },
  {
    id:          'ghostxchange-lp',
    description: 'Provide liquidity to the GST/USDT pool on GhostXchange',
    aprPct:      12.0,
    riskLevel:   'medium',
    maxCapGst:   5_000_000,
  },
  {
    id:          'l1-lending-reserve',
    description: 'Deposit to the GhostChain L1 lending reserve contract',
    aprPct:      6.5,
    riskLevel:   'low',
    maxCapGst:   10_000_000,
  },
  {
    id:          'l1-cross-chain-bridge-yield',
    description: 'Cross-chain yield via GhostChain L1 bridge (advisory — L1 executes only)',
    aprPct:      15.0,
    riskLevel:   'high',
    maxCapGst:   2_000_000,
  },
];

export function getAvailableStrategies(): YieldStrategy[] {
  return KNOWN_STRATEGIES.filter((s) => ENABLED_IDS.includes(s.id));
}

/**
 * Select the best strategy given market conditions.
 * Excludes high-risk when market TPS is low (thin market).
 */
export function selectBestStrategy(market: MarketMetrics): YieldStrategy | null {
  const candidates = getAvailableStrategies().filter((s) => {
    if (s.aprPct < MIN_APY * 100) return false;
    // In low-activity markets (< 10 TPS) avoid high-risk strategies
    if (market.tpsAvg < 10 && s.riskLevel === 'high') return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Risk-adjusted score: apr * (1 - risk_penalty)
  const riskPenalty = { low: 0, medium: 0.1, high: 0.25 } as const;
  candidates.sort((a, b) => {
    const scoreA = a.aprPct * (1 - riskPenalty[a.riskLevel]);
    const scoreB = b.aprPct * (1 - riskPenalty[b.riskLevel]);
    return scoreB - scoreA;
  });

  return candidates[0] ?? null;
}
