// Attack Detector — classifies regional anomalies into typed security events

import { randomUUID } from 'crypto';
import type { RegionId, RegionMetrics, SecurityEvent, AttackType, Severity } from '../types.js';

// Thresholds
const DDOS_RPS_THRESHOLD = 5_000;          // rpc reqs/sec spike
const VALIDATOR_LOSS_CRITICAL_PCT = 0.40;  // ≥40% validators gone → manipulation suspected
const VALIDATOR_LOSS_WARN_PCT     = 0.20;  // ≥20% → warning
const LATENCY_SPIKE_MS            = 3_000; // ms

export function detectAttacks(regions: RegionMetrics[]): SecurityEvent[] {
  const events: SecurityEvent[] = [];

  for (const r of regions) {
    const regionId = r.regionId;

    // DDoS — RPC request surge
    if (r.rpcRequestsPerSec > DDOS_RPS_THRESHOLD) {
      events.push(makeEvent(regionId, 'ddos',
        r.rpcRequestsPerSec > DDOS_RPS_THRESHOLD * 3 ? 'critical' : 'high',
        `RPC surge: ${r.rpcRequestsPerSec.toLocaleString()} req/s (threshold ${DDOS_RPS_THRESHOLD.toLocaleString()})`,
      ));
    }

    // Validator manipulation — unexpected mass drop
    const lostPct = r.totalValidators > 0
      ? (r.totalValidators - r.activeValidators) / r.totalValidators
      : 0;

    if (lostPct >= VALIDATOR_LOSS_CRITICAL_PCT) {
      events.push(makeEvent(regionId, 'validator-manipulation', 'critical',
        `${Math.round(lostPct * 100)}% of validators offline in ${regionId} — possible manipulation`,
      ));
    } else if (lostPct >= VALIDATOR_LOSS_WARN_PCT) {
      events.push(makeEvent(regionId, 'validator-manipulation', 'medium',
        `${Math.round(lostPct * 100)}% of validators offline in ${regionId}`,
      ));
    }

    // Network partition — high latency
    if (r.latencyMs >= LATENCY_SPIKE_MS) {
      events.push(makeEvent(regionId, 'network-partition',
        r.latencyMs >= LATENCY_SPIKE_MS * 2 ? 'critical' : 'high',
        `Latency spike: ${r.latencyMs} ms in ${regionId} — possible network partition`,
      ));
    }
  }

  return events;
}

function makeEvent(
  regionId: RegionId,
  attackType: AttackType,
  severity: Severity,
  description: string,
): SecurityEvent {
  return {
    id:                 randomUUID(),
    regionId,
    attackType,
    severity,
    detectedAt:         Date.now(),
    description,
    mitigationProposed: false,
  };
}
