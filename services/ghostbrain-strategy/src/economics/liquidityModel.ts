/**
 * Liquidity Model (Phase — economics layer)
 *
 * Models cross-chain GST distribution across L1, L2, and L3.
 * Detects imbalances against the target split defined in strategyTargets.
 * Feeds into the liquidity router for cross-chain rebalancing proposals.
 *
 * DETECT-ONLY — no writes.
 */

import type { LiquidityModel } from '../types.js';
import { GHOSTSTACK_API_BASE, TARGETS } from '../config/strategyTargets.js';

interface LiquiditySummaryResponse {
  l1GstBalance?: number;
  l2GstBalance?: number;
  l3GstBalance?: number;
}

export async function buildLiquidityModel(): Promise<LiquidityModel> {
  const ts = new Date().toISOString();

  // Synthetic defaults: evenly distributed across layers
  let l1Balance = 20_000_000;
  let l2Balance = 15_000_000;
  let l3Balance = 10_000_000;

  try {
    const r = await globalThis.fetch(`${GHOSTSTACK_API_BASE}/api/econ/liquidity`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (r.ok) {
      const body  = await r.json() as LiquiditySummaryResponse;
      l1Balance   = body.l1GstBalance ?? l1Balance;
      l2Balance   = body.l2GstBalance ?? l2Balance;
      l3Balance   = body.l3GstBalance ?? l3Balance;
    }
  } catch {
    /* liquidity API offline */
  }

  const total = l1Balance + l2Balance + l3Balance;
  if (total === 0) {
    return { l1Balance: 0, l2Balance: 0, l3Balance: 0, imbalancePct: 0, ts };
  }

  const l1ActualPct = (l1Balance / total) * 100;
  const l2ActualPct = (l2Balance / total) * 100;
  const l3ActualPct = (l3Balance / total) * 100;

  // Imbalance = max deviation from any single target allocation
  const l1Dev = Math.abs(l1ActualPct - TARGETS.l1TargetPct);
  const l2Dev = Math.abs(l2ActualPct - TARGETS.l2TargetPct);
  const l3Dev = Math.abs(l3ActualPct - TARGETS.l3TargetPct);
  const imbalancePct = parseFloat(Math.max(l1Dev, l2Dev, l3Dev).toFixed(2));

  let rebalanceAction: string | undefined;
  if (imbalancePct > 10) {
    // Largest surplus → largest deficit
    const layers = [
      { label: 'L1', actual: l1ActualPct, target: TARGETS.l1TargetPct },
      { label: 'L2', actual: l2ActualPct, target: TARGETS.l2TargetPct },
      { label: 'L3', actual: l3ActualPct, target: TARGETS.l3TargetPct },
    ];
    const surplus = layers.reduce((a, b) => (a.actual - a.target > b.actual - b.target ? a : b));
    const deficit = layers.reduce((a, b) => (a.actual - a.target < b.actual - b.target ? a : b));
    const movePct = Math.round(imbalancePct / 2);
    rebalanceAction = `Move ~${movePct}% GST liquidity from ${surplus.label} to ${deficit.label} pools`;
    console.info(`[liquidityModel] Liquidity imbalance detected — ${rebalanceAction}`);
  }

  return { l1Balance, l2Balance, l3Balance, imbalancePct, rebalanceAction, ts };
}
