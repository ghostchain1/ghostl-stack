// AI Sync Bus — distributes AI events across regions so all nodes share situational awareness

import type { AISyncEvent, RegionHealth, FailoverAction, MeshImbalance } from '../types.js';
import { randomUUID } from 'crypto';
import { REGIONS } from '../config/planetConfig.js';

type BusEventType = AISyncEvent['eventType'];

// In this service the bus is in-process; events are captured and included in the
// /status snapshot so other services/regions can poll them.
const _eventLog: AISyncEvent[] = [];
const MAX_LOG = 200;

function emit(
  originRegion: AISyncEvent['originRegion'],
  eventType: BusEventType,
  data: Record<string, unknown>,
): void {
  const allRegions = REGIONS.map((r) => r.id);
  const propagatedTo = allRegions.filter((r) => r !== originRegion);
  const event: AISyncEvent = {
    eventId:       randomUUID(),
    originRegion,
    eventType,
    data,
    propagatedTo,
    ts: Date.now(),
  };
  _eventLog.push(event);
  if (_eventLog.length > MAX_LOG) _eventLog.shift();
}

export function publishRegionAlerts(regions: RegionHealth[]): void {
  for (const r of regions) {
    if (r.status === 'critical' || r.status === 'offline') {
      emit(r.regionId, 'region-health', {
        status:           r.status,
        activeValidators: r.activeValidators,
        totalValidators:  r.totalValidators,
        latencyMs:        r.latencyMs,
      });
    }
  }
}

export function publishFailoverEvents(actions: FailoverAction[]): void {
  for (const a of actions) {
    emit(a.fromRegion, 'failover', {
      toRegion:       a.toRegion,
      validatorsMoved: a.validatorsMoved,
      reason:         a.reason,
    });
  }
}

export function publishMeshImbalances(imbalances: MeshImbalance[]): void {
  for (const i of imbalances) {
    emit(i.surplus, 'mesh-imbalance', {
      deficit:      i.deficit,
      chainId:      i.chainId,
      deltaGst:     i.deltaGst.toString(),
      imbalancePct: i.imbalancePct,
    });
  }
}

export function recentEvents(limit = 50): AISyncEvent[] {
  return _eventLog.slice(-limit);
}
