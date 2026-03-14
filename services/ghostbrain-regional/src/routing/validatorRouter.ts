// Validator Router — balances validator assignments across geographic regions

import { randomUUID } from 'crypto';
import { REGIONS } from '../config/regionConfig.js';
import type { RegionMetrics, ValidatorBalance, RegionalProposal } from '../types.js';

export function routeValidators(regions: RegionMetrics[]): {
  balance:   ValidatorBalance[];
  proposals: RegionalProposal[];
} {
  console.log('[regional] Balancing validators across regions');

  const balance: ValidatorBalance[]     = [];
  const proposals: RegionalProposal[]   = [];

  for (const metrics of regions) {
    const target = REGIONS[metrics.regionId].targetValidators;
    const delta  = target - metrics.activeValidators;

    balance.push({
      regionId: metrics.regionId,
      assigned: metrics.activeValidators,
      target,
      delta,
    });

    if (Math.abs(delta) >= 2) {
      const type: RegionalProposal['type'] = delta > 0 ? 'scale-out' : 'scale-in';
      const urgency: RegionalProposal['urgency'] =
        Math.abs(delta) >= 5 ? 'high' : 'medium';

      proposals.push({
        id:          randomUUID(),
        type,
        description: `Region ${metrics.regionId}: ${metrics.activeValidators} active vs ${target} target — delta ${delta > 0 ? '+' : ''}${delta}`,
        payload:     {
          regionId: metrics.regionId,
          current:  metrics.activeValidators,
          target,
          delta,
        },
        urgency,
        createdAt:   Date.now(),
        requiresHumanRatification: true,
      });
    }
  }

  return { balance, proposals };
}
