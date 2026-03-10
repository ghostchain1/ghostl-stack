// Security Mesh — coordinates security AI across all regions, generates mitigation proposals

import { randomUUID } from 'crypto';
import type { SecurityEvent, RegionMetrics, RegionalProposal } from '../types.js';
import { detectAttacks } from './attackDetector.js';

// Ring buffer of recent events for audit trail
const _eventHistory: SecurityEvent[] = [];
const MAX_HISTORY = 500;

function recordEvents(events: SecurityEvent[]): void {
  _eventHistory.push(...events);
  if (_eventHistory.length > MAX_HISTORY) {
    _eventHistory.splice(0, _eventHistory.length - MAX_HISTORY);
  }
}

export function runSecurityMesh(regions: RegionMetrics[]): {
  events:    SecurityEvent[];
  proposals: RegionalProposal[];
} {
  const events = detectAttacks(regions);
  recordEvents(events);

  const proposals: RegionalProposal[] = [];

  for (const event of events) {
    // Mark event as having a proposal
    event.mitigationProposed = true;

    // Determine target region for reroute
    const safeRegion = regions
      .filter((r) => r.regionId !== event.regionId && r.validatorLoad < 0.6)
      .sort((a, b) => a.validatorLoad - b.validatorLoad)
      .at(0);

    let description: string;
    if (event.attackType === 'ddos' || event.attackType === 'network-partition') {
      description = safeRegion
        ? `${event.attackType} in ${event.regionId} — proposed: route traffic to ${safeRegion.regionId}`
        : `${event.attackType} in ${event.regionId} — no safe reroute available; escalate to on-call`;
    } else {
      description = `${event.attackType} in ${event.regionId}: ${event.description} — proposed: initiate validator audit`;
    }

    proposals.push({
      id:          randomUUID(),
      type:        'security-response',
      description,
      payload: {
        attackEvent: event,
        rerouteTarget: safeRegion?.regionId ?? null,
      },
      urgency:   event.severity === 'critical' ? 'critical' : 'high',
      createdAt: Date.now(),
      requiresHumanRatification: true,
    });
  }

  if (events.length) {
    console.log(`[security] ${events.length} event(s) detected; ${proposals.length} mitigation proposal(s) queued`);
  }

  return { events, proposals };
}

export function securityEventHistory(): SecurityEvent[] {
  return [..._eventHistory];
}
