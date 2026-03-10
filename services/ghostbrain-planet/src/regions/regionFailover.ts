// Region Failover — proposes validator-set migration when a region goes offline/critical

import { REGIONS, THRESHOLDS } from '../config/planetConfig.js';
import type { FailoverAction, PlanetProposal, RegionHealth } from '../types.js';
import { randomUUID } from 'crypto';

function findBestTarget(
  sourceId: string,
  regions: RegionHealth[],
): RegionHealth | undefined {
  // Prefer healthy, lower-priority (higher priority number) regions to avoid
  // overloading primaries.  Sort ascending by priority (best = lowest number)
  // then pick first that has capacity.
  const sourceDef = REGIONS.find((r) => r.id === sourceId);
  return regions
    .filter(
      (r) =>
        r.regionId !== sourceId &&
        r.status === 'healthy' &&
        r.activeValidators < r.totalValidators * 1.5, // rough capacity guard
    )
    .sort((a, b) => {
      const priorityA = REGIONS.find((r) => r.id === a.regionId)?.priority ?? 99;
      const priorityB = REGIONS.find((r) => r.id === b.regionId)?.priority ?? 99;
      if (sourceDef && priorityA === sourceDef.priority) return 1;
      if (sourceDef && priorityB === sourceDef.priority) return -1;
      return priorityA - priorityB;
    })
    .at(0);
}

export function computeFailoverActions(
  regions: RegionHealth[],
): FailoverAction[] {
  const actions: FailoverAction[] = [];

  for (const region of regions) {
    if (region.status !== 'critical' && region.status !== 'offline') continue;

    const target = findBestTarget(region.regionId, regions);
    if (!target) continue;

    const validators =
      region.totalValidators - region.activeValidators;

    actions.push({
      fromRegion: region.regionId,
      toRegion:   target.regionId,
      validatorsMoved: validators,
      reason: `Region ${region.regionId} status=${region.status}, migrating ${validators} validators to ${target.regionId}`,
    });
  }

  return actions;
}

export function failoverProposals(
  actions: FailoverAction[],
  maxProposals: number,
): PlanetProposal[] {
  return actions.slice(0, maxProposals).map((a) => ({
    id: randomUUID(),
    type: 'region-failover',
    description: a.reason,
    payload: { ...a },
    urgency: 'critical',
    createdAt: Date.now(),
    requiresHumanRatification: true,
  }));
}
