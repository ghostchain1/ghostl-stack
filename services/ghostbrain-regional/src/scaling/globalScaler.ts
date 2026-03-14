// Global Scaler — detects transaction spikes, proposes autonomous node deployment
// All scaling actions are proposals submitted to governance relay — never executed inline.

import { randomUUID } from 'crypto';
import { API_BASE } from '../config/regionConfig.js';
import type { RegionId, RegionMetrics, ScalingAction, RegionalProposal } from '../types.js';

interface ChainMetrics {
  region?:      string;
  chainId?:     number;
  tps?:         number;
  pendingTxs?:  number;
  blockTime?:   number;
}

// Layer assignment by chain ID
type Layer = 'L1' | 'L2' | 'L3';
function layerOf(chainId: number): Layer {
  if (chainId === 901) return 'L2';
  if (chainId === 903) return 'L3';
  return 'L1';
}

const TPS_SCALE_THRESHOLD = 500;           // tps above this → propose scale-out
const PENDING_SCALE_THRESHOLD = 20_000;    // pending txs above this → critical scale-out
const LOAD_SCALE_DOWN_PCT = 0.20;          // validator load below 20% for 3+ regions → scale-in

export async function autoScale(regions: RegionMetrics[]): Promise<{
  actions:   ScalingAction[];
  proposals: RegionalProposal[];
}> {
  let chainMetrics: ChainMetrics[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/chains/l3/metrics`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) chainMetrics = (await res.json()) as ChainMetrics[];
  } catch {
    // proceed without chain metrics
  }

  const actions:   ScalingAction[]    = [];
  const proposals: RegionalProposal[] = [];

  // Scale-out based on chain TPS / pending tx pressure
  for (const cm of chainMetrics) {
    const regionId: RegionId = (['north-america', 'europe', 'asia'] as RegionId[])
      .find((r) => r === cm.region) ?? 'north-america';

    const layer    = layerOf(cm.chainId ?? 14000101);
    const tps      = cm.tps ?? 0;
    const pending  = cm.pendingTxs ?? 0;

    let nodesNeeded = 0;
    let urgency: ScalingAction['urgency'] = 'low';

    if (pending > PENDING_SCALE_THRESHOLD) {
      nodesNeeded = Math.min(5, Math.ceil(pending / PENDING_SCALE_THRESHOLD));
      urgency = 'high';
    } else if (tps > TPS_SCALE_THRESHOLD) {
      nodesNeeded = Math.min(3, Math.ceil(tps / TPS_SCALE_THRESHOLD));
      urgency = 'medium';
    }

    if (nodesNeeded > 0) {
      const action: ScalingAction = {
        regionId,
        layer,
        nodesRequested: nodesNeeded,
        reason: `Transaction spike: ${tps} TPS, ${pending.toLocaleString()} pending on ${layer} in ${regionId}`,
        urgency,
      };
      actions.push(action);

      proposals.push({
        id:          randomUUID(),
        type:        'scale-out',
        description: action.reason + ` — deploy ${nodesNeeded} new ${layer} node(s)`,
        payload:     { ...action },
        urgency:     urgency === 'high' ? 'high' : 'medium',
        createdAt:   Date.now(),
        requiresHumanRatification: true,
      });

      console.log(`[scaler] Scale-out proposed: ${nodesNeeded}×${layer} in ${regionId}`);
    }
  }

  // Scale-in if all regions are under-loaded
  const lowLoadRegions = regions.filter((r) => r.validatorLoad < LOAD_SCALE_DOWN_PCT);
  if (lowLoadRegions.length >= 3 && regions.length >= 3) {
    proposals.push({
      id:          randomUUID(),
      type:        'scale-in',
      description: `All ${lowLoadRegions.length} regions below ${Math.round(LOAD_SCALE_DOWN_PCT * 100)}% load — consolidate idle nodes`,
      payload:     { regions: lowLoadRegions.map((r) => r.regionId) },
      urgency:     'low',
      createdAt:   Date.now(),
      requiresHumanRatification: true,
    });
  }

  return { actions, proposals };
}
