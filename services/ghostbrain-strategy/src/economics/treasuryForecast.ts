/**
 * Treasury Forecast (Phase 89)
 *
 * Predicts 30-day forward:
 *   - GST fee revenue from L1/L2/L3 activity
 *   - Operational expenses (validator rewards, infra, security)
 *   - Staking reward outflow
 *   - Liquidity requirements
 *
 * Source: GhostStack BFF /api/treasury/summary
 * Shortfall recommendations are flagged for governance submission.
 *
 * DETECT-ONLY — no writes.
 */

import type { TreasuryProjection } from '../types.js';
import { GHOSTSTACK_API_BASE, TARGETS } from '../config/strategyTargets.js';

interface TreasurySummary {
  gstReserve?:        number;
  thirtyDayRevenue?:  number;
  thirtyDayExpenses?: number;
  stakingOutflow?:    number;
}

export async function modelTreasury(): Promise<TreasuryProjection> {
  const ts = new Date().toISOString();

  // Synthetic safe defaults (scaled to a 1 B GST supply)
  let gstReserve        = 50_000_000;   // 50 M GST in treasury
  let projectedRevenue  = 2_000_000;    // ~2 M GST/30d from fees
  let projectedExpenses = 1_200_000;    // ~1.2 M GST/30d ops cost
  let stakingRewards    = 500_000;      // ~500 K GST/30d staking

  try {
    const r = await globalThis.fetch(`${GHOSTSTACK_API_BASE}/api/treasury/summary`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (r.ok) {
      const body       = await r.json() as TreasurySummary;
      gstReserve       = body.gstReserve        ?? gstReserve;
      projectedRevenue = body.thirtyDayRevenue  ?? projectedRevenue;
      projectedExpenses = body.thirtyDayExpenses ?? projectedExpenses;
      stakingRewards   = body.stakingOutflow    ?? stakingRewards;
    }
  } catch {
    /* treasury API offline */
  }

  const totalOutflow       = projectedExpenses + stakingRewards;
  const netFlow            = projectedRevenue - totalOutflow;
  const liquidityShortfall = netFlow < 0
    ? Math.abs(netFlow / gstReserve) * 100
    : 0;

  const minLiquidityPct = TARGETS.liquidityBuffer;
  const reservePct      = (gstReserve / 1_000_000_000) * 100;  // % of supply
  let recommendation: string | undefined;

  if (liquidityShortfall > minLiquidityPct) {
    recommendation = `Treasury shortfall forecast: ${liquidityShortfall.toFixed(1)}% — propose moving ${Math.ceil(liquidityShortfall)}% from staking pool to discretionary reserve`;
  } else if (reservePct < minLiquidityPct) {
    recommendation = `Treasury reserve below ${minLiquidityPct}% buffer — propose fee increase or validator reward reduction via governance`;
  }

  if (recommendation) {
    console.info(`[treasuryForecast] ${recommendation}`);
  } else {
    console.info('[treasuryForecast] Treasury projection healthy');
  }

  return {
    gstReserve,
    projectedRevenue,
    projectedExpenses,
    liquidityShortfall: parseFloat(liquidityShortfall.toFixed(2)),
    stakingRewards,
    recommendation,
    ts,
  };
}
