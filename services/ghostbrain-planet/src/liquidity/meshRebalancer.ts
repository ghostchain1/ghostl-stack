// Mesh Rebalancer — converts detected imbalances into governance proposals

import { randomUUID } from 'crypto';
import { THRESHOLDS } from '../config/planetConfig.js';
import type {
  LiquidityMeshSnapshot,
  MeshRebalanceAction,
  PlanetProposal,
} from '../types.js';

export function computeRebalanceActions(
  mesh: LiquidityMeshSnapshot,
): MeshRebalanceAction[] {
  return mesh.imbalances
    .filter((i) => i.imbalancePct >= THRESHOLDS.meshImbalancePct * 100)
    .map((i) => {
      const priority: MeshRebalanceAction['priority'] =
        i.imbalancePct >= 50 ? 'high' : i.imbalancePct >= 35 ? 'medium' : 'low';

      // Move half the delta to restore balance
      const amountGst = i.deltaGst / 2n;

      return {
        from:       i.surplus,
        to:         i.deficit,
        chainId:    i.chainId,
        amountGst,
        priority,
      };
    });
}

export function rebalanceProposals(
  actions: MeshRebalanceAction[],
  maxProposals: number,
): PlanetProposal[] {
  const sorted = [...actions].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return sorted.slice(0, maxProposals).map((a) => ({
    id:          randomUUID(),
    type:        'mesh-rebalance' as const,
    description: `Move ${a.amountGst.toString()} wei GST from ${a.from} → ${a.to} on chain ${a.chainId} (${a.priority} priority)`,
    payload: {
      from:       a.from,
      to:         a.to,
      chainId:    a.chainId,
      amountGst:  a.amountGst.toString(),
      priority:   a.priority,
    },
    urgency:     (a.priority === 'high' ? 'high' : 'medium') as PlanetProposal['urgency'],
    createdAt:   Date.now(),
    requiresHumanRatification: true as const,
  }));
}
