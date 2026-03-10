// Europe region controller

import { queryRegion } from './regionController.js';
import type { RegionMetrics } from '../types.js';

export async function manageEU(): Promise<RegionMetrics> {
  console.log('[regional] Managing Europe region');
  const metrics = await queryRegion('europe');
  console.log(
    `[regional] EU — load:${(metrics.validatorLoad * 100).toFixed(1)}%  ` +
    `validators:${metrics.activeValidators}/${metrics.totalValidators}  ` +
    `latency:${metrics.latencyMs}ms`,
  );
  return metrics;
}
