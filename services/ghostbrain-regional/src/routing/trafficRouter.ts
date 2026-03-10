// Traffic Router — distributes load globally, proposes reroutes when regions overflow

import { randomUUID } from 'crypto';
import { REGIONS } from '../config/regionConfig.js';
import type { RegionId, RegionMetrics, TrafficLoad, RegionalProposal } from '../types.js';

function selectReRoute(overloadedId: RegionId, all: RegionMetrics[]): RegionId | undefined {
  // Find the healthy region with the lowest load (excluding the source)
  return all
    .filter((r) => r.regionId !== overloadedId && r.validatorLoad < 0.7)
    .sort((a, b) => a.validatorLoad - b.validatorLoad)
    .at(0)?.regionId;
}

export function routeTraffic(regions: RegionMetrics[]): {
  loads:     TrafficLoad[];
  proposals: RegionalProposal[];
} {
  const loads: TrafficLoad[]          = [];
  const proposals: RegionalProposal[] = [];

  for (const metrics of regions) {
    const def      = REGIONS[metrics.regionId];
    const loadPct  = metrics.validatorLoad * 100;
    const overflow = loadPct > def.loadThreshold;
    const routeTo  = overflow ? selectReRoute(metrics.regionId, regions) : undefined;

    loads.push({ regionId: metrics.regionId, load: loadPct, overflow, routeTo });

    if (overflow && routeTo) {
      console.log(
        `[traffic] ${metrics.regionId} load ${loadPct.toFixed(1)}% > threshold ${def.loadThreshold}% → routing to ${routeTo}`,
      );
      proposals.push({
        id:          randomUUID(),
        type:        'traffic-reroute',
        description: `Region ${metrics.regionId} at ${loadPct.toFixed(1)}% load — reroute overflow traffic to ${routeTo}`,
        payload:     { from: metrics.regionId, to: routeTo, loadPct },
        urgency:     loadPct >= 95 ? 'critical' : 'high',
        createdAt:   Date.now(),
        requiresHumanRatification: true,
      });
    }
  }

  return { loads, proposals };
}
