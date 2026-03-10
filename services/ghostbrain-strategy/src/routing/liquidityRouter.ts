/**
 * Liquidity Router (Phase 90)
 *
 * Optimizes cross-chain GST liquidity routing across:
 *   GhostChain L1 ↔ GhostL2 ↔ GhostL3
 *
 * Routing law enforced:
 *   L3 → L2 → L1  (never L3 → L1 directly)
 *   All external settlement through GhostChain L1 only
 *
 * Produces a RoutingResult that may generate a governance proposal when
 * the rebalancing exceeds the liquidity-buffer threshold.
 *
 * DETECT-ONLY — routing actions are proposals only.
 */

import type { RoutingResult } from '../types.js';
import { buildLiquidityModel } from '../economics/liquidityModel.js';
import { TARGETS } from '../config/strategyTargets.js';

export async function optimizeLiquidity(): Promise<RoutingResult> {
  const ts    = new Date().toISOString();
  const model = await buildLiquidityModel();

  const total = model.l1Balance + model.l2Balance + model.l3Balance;
  if (total === 0) {
    return { l1Pct: 0, l2Pct: 0, l3Pct: 0, optimal: true, actions: [], ts };
  }

  const l1Pct = parseFloat(((model.l1Balance / total) * 100).toFixed(1));
  const l2Pct = parseFloat(((model.l2Balance / total) * 100).toFixed(1));
  const l3Pct = parseFloat(((model.l3Balance / total) * 100).toFixed(1));

  const optimal = model.imbalancePct <= TARGETS.liquidityBuffer / 2;
  const actions: string[] = [];

  if (!optimal) {
    // Build ordered correction actions respecting routing law (L3→L2→L1)
    if (l3Pct > TARGETS.l3TargetPct + 5) {
      actions.push(`Bridge ${(l3Pct - TARGETS.l3TargetPct).toFixed(1)}% GST from L3 → L2`);
    }
    if (l2Pct > TARGETS.l2TargetPct + 5) {
      actions.push(`Bridge ${(l2Pct - TARGETS.l2TargetPct).toFixed(1)}% GST from L2 → L1`);
    }
    if (l1Pct < TARGETS.l1TargetPct - 5) {
      actions.push(`Increase L1 reserve by ${(TARGETS.l1TargetPct - l1Pct).toFixed(1)}% to maintain settlement buffer`);
    }
    if (model.rebalanceAction) {
      actions.push(model.rebalanceAction);
    }

    console.info(`[liquidityRouter] Optimizing cross-chain liquidity — L1:${l1Pct}% L2:${l2Pct}% L3:${l3Pct}% — ${actions.length} action(s)`);
  } else {
    console.info(`[liquidityRouter] Cross-chain liquidity optimal — L1:${l1Pct}% L2:${l2Pct}% L3:${l3Pct}%`);
  }

  return { l1Pct, l2Pct, l3Pct, optimal, actions, ts };
}
