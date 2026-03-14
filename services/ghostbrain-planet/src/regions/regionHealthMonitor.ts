// Region Health Monitor — detects degradation trends, latency spikes, block-height drift

import type { RegionHealth } from '../types.js';

const BLOCK_DRIFT_THRESHOLD = 50; // blocks behind global tip → flagged

export interface RegionAlert {
  regionId: string;
  alertType: 'latency-spike' | 'validator-loss' | 'block-drift' | 'offline';
  detail: string;
  severity: 'warning' | 'critical';
}

export function detectAlerts(regions: RegionHealth[]): RegionAlert[] {
  const alerts: RegionAlert[] = [];

  // Global tip = max known block height across healthy regions
  const healthyHeights = regions
    .filter((r) => r.status === 'healthy' || r.status === 'degraded')
    .map((r) => r.blockHeight);
  const globalTip = healthyHeights.length ? Math.max(...healthyHeights) : 0;

  for (const region of regions) {
    if (region.status === 'offline') {
      alerts.push({
        regionId: region.regionId,
        alertType: 'offline',
        detail: `Region ${region.regionId} is offline (latency ${region.latencyMs} ms, activeValidators ${region.activeValidators}/${region.totalValidators})`,
        severity: 'critical',
      });
      continue;
    }

    if (region.status === 'critical') {
      const lostPct = Math.round(
        ((region.totalValidators - region.activeValidators) /
          Math.max(region.totalValidators, 1)) *
          100,
      );
      alerts.push({
        regionId: region.regionId,
        alertType: 'validator-loss',
        detail: `Region ${region.regionId}: ${lostPct}% of validators offline`,
        severity: 'critical',
      });
    } else if (region.status === 'degraded') {
      alerts.push({
        regionId: region.regionId,
        alertType: 'validator-loss',
        detail: `Region ${region.regionId}: degraded — ${region.activeValidators}/${region.totalValidators} validators active`,
        severity: 'warning',
      });
    }

    if (region.latencyMs >= 2_000) {
      alerts.push({
        regionId: region.regionId,
        alertType: 'latency-spike',
        detail: `Region ${region.regionId}: latency ${region.latencyMs} ms`,
        severity: region.latencyMs >= 4_000 ? 'critical' : 'warning',
      });
    }

    if (
      globalTip > 0 &&
      region.blockHeight > 0 &&
      globalTip - region.blockHeight > BLOCK_DRIFT_THRESHOLD
    ) {
      alerts.push({
        regionId: region.regionId,
        alertType: 'block-drift',
        detail: `Region ${region.regionId}: ${globalTip - region.blockHeight} blocks behind global tip`,
        severity: 'warning',
      });
    }
  }

  return alerts;
}
