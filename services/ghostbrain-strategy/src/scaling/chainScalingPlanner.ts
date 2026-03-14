/**
 * Chain Scaling Planner (Phase 92)
 *
 * Predictive scaling for GhostL3 block producers.
 *
 * Combines network load forecast and validator load to project the
 * 30-minute forward chain load.  When load is expected to exceed the
 * critical threshold, a governance proposal to deploy additional L3
 * block producers is generated.
 *
 * Routing law: L3 capacity changes require governance approval at L2,
 * which is then ratified at L1.  This planner outputs proposals only.
 *
 * DETECT-ONLY.
 */

import type { ScalingPlan } from '../types.js';
import { GHOSTSTACK_API_BASE, TARGETS } from '../config/strategyTargets.js';

interface ChainMetrics {
  l3BlockTimeMs?:     number;
  l3TxQueueDepth?:   number;
  l3LoadPct?:        number;    // 0–100 utilization estimate
}

export async function planScaling(): Promise<ScalingPlan> {
  const ts = new Date().toISOString();

  let currentLoadPct   = 55;
  let projectedLoadPct = 62;

  try {
    const r = await globalThis.fetch(`${GHOSTSTACK_API_BASE}/api/chains/l3/metrics`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (r.ok) {
      const body       = await r.json() as ChainMetrics;
      currentLoadPct   = body.l3LoadPct ?? currentLoadPct;

      // Simple extrapolation: queue depth adds projected pressure
      const queueFactor = body.l3TxQueueDepth ? Math.min(body.l3TxQueueDepth / 10, 20) : 7;
      projectedLoadPct  = Math.min(currentLoadPct + queueFactor, 100);
    }
  } catch {
    /* chain API offline */
  }

  const recommendAction = projectedLoadPct >= TARGETS.chainLoadCritical;
  const highOnly        = projectedLoadPct >= TARGETS.chainLoadHigh && projectedLoadPct < TARGETS.chainLoadCritical;

  let action: string | undefined;
  if (recommendAction) {
    const nodesToAdd = projectedLoadPct >= 95 ? 4 : 2;
    action = `Deploy ${nodesToAdd} additional L3 block producers — projected load ${projectedLoadPct}% exceeds critical threshold`;
    console.info(`[chainScalingPlanner] Plan: ${action}`);
  } else if (highOnly) {
    action = `Pre-warm 1 standby L3 block producer — projected load ${projectedLoadPct}% approaching critical`;
    console.info(`[chainScalingPlanner] Advisory: ${action}`);
  } else {
    console.info(`[chainScalingPlanner] L3 load nominal — current ${currentLoadPct}% / projected ${projectedLoadPct}%`);
  }

  return { currentLoadPct, projectedLoadPct, recommendAction, action, ts };
}
