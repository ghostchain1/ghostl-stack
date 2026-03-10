/**
 * Network Forecast (Phase 85)
 *
 * Reads chain topology from the GhostStack BFF and produces a normalized
 * transaction-load forecast for L1/L2/L3.  Detects upcoming:
 *   - Transaction spikes
 *   - Bridge congestion
 *   - Validator overload
 *
 * DETECT-ONLY — no writes, no governance calls.
 */

import type { ForecastResult, RiskLevel } from '../types.js';
import { GHOSTSTACK_API_BASE, TARGETS } from '../config/strategyTargets.js';

interface ChainNode {
  id:           string;
  layer:        'L1' | 'L2' | 'L3';
  status:       'online' | 'degraded' | 'offline';
  txThroughput?: number;   // tx/s
  peerCount?:    number;
}

interface TopologyResponse {
  nodes:     ChainNode[];
  timestamp: string;
}

function riskFromValue(v: number, highThreshold: number, critThreshold: number): RiskLevel {
  if (v >= critThreshold) return 'critical';
  if (v >= highThreshold) return 'high';
  if (v >= highThreshold * 0.7) return 'moderate';
  return 'low';
}

export async function forecastNetwork(): Promise<ForecastResult> {
  const ts = new Date().toISOString();

  // Attempt to read live topology from BFF.  Falls back to a synthetic reading
  // if the API is unreachable so the rest of the strategy cycle is not blocked.
  let txLoad = 50;  // baseline %
  let detail = 'Network load estimated (BFF unreachable)';

  try {
    const r = await globalThis.fetch(`${GHOSTSTACK_API_BASE}/api/network/topology`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (r.ok) {
      const body = await r.json() as TopologyResponse;
      const online = body.nodes.filter(n => n.status === 'online');
      const degraded = body.nodes.filter(n => n.status === 'degraded');

      // Infer load from degraded ratio and throughput signals
      const degradedRatio = body.nodes.length
        ? (degraded.length / body.nodes.length) * 100
        : 0;
      const avgThroughput = online
        .map(n => n.txThroughput ?? 0)
        .reduce((a, b) => a + b, 0) / (online.length || 1);

      // Normalize throughput to 0–100 using 500 tx/s as saturation baseline
      const txNorm = Math.min((avgThroughput / 500) * 100, 100);
      txLoad = Math.round((txNorm + degradedRatio) / 2);
      detail = `${online.length}/${body.nodes.length} nodes online; avg throughput ${avgThroughput.toFixed(1)} tx/s`;
    }
  } catch {
    // BFF offline — proceed with synthetic baseline
  }

  const level = riskFromValue(txLoad, TARGETS.validatorLoad, TARGETS.chainLoadCritical);

  let recommendation: string | undefined;
  if (level === 'critical') {
    recommendation = 'Initiate emergency L3 block producer expansion via governance proposal';
  } else if (level === 'high') {
    recommendation = 'Pre-warm L3 capacity; monitor L1→L2 bridge queue depth';
  } else if (level === 'moderate') {
    recommendation = 'Increase L2 sequencer batch window to absorb throughput spikes';
  }

  if (txLoad > TARGETS.validatorLoad) {
    console.info(`[networkForecast] High transaction load expected — score ${txLoad}%`);
  }

  return { metric: 'network_load', value: txLoad, level, detail, recommendation, ts };
}
