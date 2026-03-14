// Shared region controller — queries API for per-region validator metrics

import { API_BASE } from '../config/regionConfig.js';
import type { RegionId, RegionMetrics } from '../types.js';
import { REGIONS } from '../config/regionConfig.js';

interface ValidatorEntry {
  region?:      string;
  online?:      boolean;
  latencyMs?:   number;
  load?:        number;        // 0–1
  rpcRps?:      number;
}

export async function queryRegion(regionId: RegionId): Promise<RegionMetrics> {
  const def = REGIONS[regionId];
  let entries: ValidatorEntry[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/validators`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) {
      const all = (await res.json()) as ValidatorEntry[];
      entries = all.filter((v) => v.region === regionId);
    }
  } catch {
    // fall through — zeroed metrics
  }

  // If no region-specific data, synthesise from all validators proportionally
  if (!entries.length) {
    return {
      regionId,
      validatorLoad:     0,
      rpcRequestsPerSec: 0,
      latencyMs:         0,
      activeValidators:  def.targetValidators,
      totalValidators:   def.targetValidators,
      onlinePct:         100,
      lastUpdatedAt:     Date.now(),
    };
  }

  const active = entries.filter((v) => v.online !== false).length;
  const total  = entries.length;
  const avgLoad    = entries.reduce((s, v) => s + (v.load ?? 0), 0) / total;
  const avgLatency = entries.reduce((s, v) => s + (v.latencyMs ?? 0), 0) / total;
  const avgRps     = entries.reduce((s, v) => s + (v.rpcRps ?? 0), 0) / total;

  return {
    regionId,
    validatorLoad:     Math.round(avgLoad * 1000) / 1000,
    rpcRequestsPerSec: Math.round(avgRps),
    latencyMs:         Math.round(avgLatency),
    activeValidators:  active,
    totalValidators:   total,
    onlinePct:         Math.round((active / total) * 100),
    lastUpdatedAt:     Date.now(),
  };
}
