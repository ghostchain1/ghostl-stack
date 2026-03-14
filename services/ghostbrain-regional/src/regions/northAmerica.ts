// North America region controller

import { queryRegion } from './regionController.js';
import type { RegionMetrics } from '../types.js';

export async function manageNA(): Promise<RegionMetrics> {
  console.log('[regional] Managing North America region');
  const metrics = await queryRegion('north-america');
  console.log(
    `[regional] NA — load:${(metrics.validatorLoad * 100).toFixed(1)}%  ` +
    `validators:${metrics.activeValidators}/${metrics.totalValidators}  ` +
    `latency:${metrics.latencyMs}ms`,
  );
  return metrics;
}
