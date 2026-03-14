// Asia region controller

import { queryRegion } from './regionController.js';
import type { RegionMetrics } from '../types.js';

export async function manageAsia(): Promise<RegionMetrics> {
  console.log('[regional] Managing Asia region');
  const metrics = await queryRegion('asia');
  console.log(
    `[regional] ASIA — load:${(metrics.validatorLoad * 100).toFixed(1)}%  ` +
    `validators:${metrics.activeValidators}/${metrics.totalValidators}  ` +
    `latency:${metrics.latencyMs}ms`,
  );
  return metrics;
}
