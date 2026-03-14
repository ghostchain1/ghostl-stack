// Region Manager — queries per-region validator health, aggregates region status

import { API_BASE, REGIONS, THRESHOLDS } from '../config/planetConfig.js';
import type { RegionHealth, RegionStatus } from '../types.js';

interface ValidatorApiEntry {
  region?: string;
  online?: boolean;
  latencyMs?: number;
  blockHeight?: number;
}

function validatorStatus(
  online: number,
  total: number,
  latencyMs: number,
): RegionStatus {
  if (latencyMs >= THRESHOLDS.regionOfflineLatencyMs) return 'offline';
  const offlinePct = (total - online) / Math.max(total, 1);
  if (offlinePct >= THRESHOLDS.regionCriticalValidatorPct) return 'critical';
  if (offlinePct >= THRESHOLDS.regionDegradedValidatorPct) return 'degraded';
  return 'healthy';
}

export async function assessRegions(): Promise<RegionHealth[]> {
  let entries: ValidatorApiEntry[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/validators`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      entries = (await res.json()) as ValidatorApiEntry[];
    }
  } catch {
    // network unavailable – fall through to synthetic zeroed data
  }

  // Group by region definition
  return REGIONS.map((def) => {
    const regional = entries.filter(
      (v) => v.region === def.id,
    );

    const active = regional.filter((v) => v.online !== false).length;
    const total = regional.length > 0 ? regional.length : def.validatorCount;
    const latency = regional.length
      ? regional.reduce((s, v) => s + (v.latencyMs ?? 0), 0) / regional.length
      : 0;
    const blockHeight =
      regional.length
        ? Math.max(...regional.map((v) => v.blockHeight ?? 0))
        : 0;

    return {
      regionId: def.id,
      status:   validatorStatus(active, total, latency),
      activeValidators: active,
      totalValidators:  total,
      latencyMs:        Math.round(latency),
      blockHeight,
      lastCheckAt: Date.now(),
    } satisfies RegionHealth;
  });
}
