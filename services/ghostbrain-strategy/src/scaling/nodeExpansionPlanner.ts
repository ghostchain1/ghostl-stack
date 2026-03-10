/**
 * Node Expansion Planner (Phase 93)
 *
 * Plans node expansion across:
 *   - RPC nodes (public API surface)
 *   - Validators (consensus integrity)
 *   - Archive nodes (historical data + analytics)
 *
 * Queries GhostBrain Core for current node inventory and generates
 * expansion recommendations when capacity margins are tight.
 *
 * DETECT-ONLY — expansion proposals go to signing relay for governance.
 */

import type { NodeExpansionPlan } from '../types.js';
import { GHOSTSTACK_API_BASE, TARGETS } from '../config/strategyTargets.js';

interface NodeInventory {
  rpcNodeCount?:     number;
  validatorCount?:   number;
  archiveNodeCount?: number;
  rpcLoadPct?:       number;
  validatorLoadPct?: number;
}

export async function planNodes(): Promise<NodeExpansionPlan> {
  const ts = new Date().toISOString();

  let rpcNodeCount     = 3;
  let validatorCount   = 21;
  let archiveNodeCount = 2;
  let rpcLoadPct       = 60;
  let validatorLoadPct = 65;

  try {
    const r = await globalThis.fetch(`${GHOSTSTACK_API_BASE}/api/nodes/inventory`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (r.ok) {
      const body       = await r.json() as NodeInventory;
      rpcNodeCount     = body.rpcNodeCount     ?? rpcNodeCount;
      validatorCount   = body.validatorCount   ?? validatorCount;
      archiveNodeCount = body.archiveNodeCount ?? archiveNodeCount;
      rpcLoadPct       = body.rpcLoadPct       ?? rpcLoadPct;
      validatorLoadPct = body.validatorLoadPct ?? validatorLoadPct;
    }
  } catch {
    /* node inventory API offline */
  }

  const expansion: string[] = [];

  // RPC node expansion: above 80% load, each node serves too many requests
  if (rpcLoadPct > 80) {
    expansion.push(`Add ${Math.ceil((rpcLoadPct - 70) / 10)} RPC node(s) — load at ${rpcLoadPct}%`);
  }

  // Validator expansion: maintain Byzantine fault tolerance (≥ 3f+1, target 33+ nodes)
  if (validatorCount < 33 && validatorLoadPct > TARGETS.validatorLoad) {
    const needed = 33 - validatorCount;
    expansion.push(`Onboard ${needed} validator(s) to maintain BFT safety margin (current ${validatorCount})`);
  }

  // Archive node expansion: analytics / state sync coverage
  if (archiveNodeCount < 3) {
    expansion.push('Deploy 1 additional archive node for state sync redundancy');
  }

  if (expansion.length) {
    console.info(`[nodeExpansionPlanner] Planning node expansion — ${expansion.length} recommendation(s)`);
  } else {
    console.info('[nodeExpansionPlanner] Node capacity adequate — no expansion needed');
  }

  return { rpcNodeCount, validatorCount, archiveNodeCount, expansion, ts };
}
