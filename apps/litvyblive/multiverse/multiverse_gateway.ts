/**
 * Multiverse Gateway — central coordinator connecting LitVybzLive to virtual worlds.
 *
 * Responsibilities:
 *  - Route avatar sync updates to all connected worlds
 *  - Dispatch virtual events to worlds that support the required asset type
 *  - Provide a unified gateway status overview for monitoring
 *
 * New worlds connect by registering via world_registry and exposing
 * an API endpoint; the gateway handles fan-out from within LitVybzLive.
 */

import { getDb } from '../backend/src/db/index.js';
import { propagateAvatarUpdate, syncAvatarToWorld, type SyncResult } from './avatar_world_sync.js';
import { worldsByAssetType } from './world_registry.js';

export { registerWorld, getWorldById, listActiveWorlds, listAllWorlds, setWorldStatus }
  from './world_registry.js';

export { syncAvatarToWorld, propagateAvatarUpdate, listAvatarStates, getAvatarState }
  from './avatar_world_sync.js';

// ── Avatar sync ───────────────────────────────────────────────────────────────

/**
 * Sync a creator's avatar to ALL active connected worlds.
 * Shorthand over propagateAvatarUpdate that returns per-world results.
 */
export async function syncCreatorToAllWorlds(
  creatorId:      string,
  avatarModel:    string,
  animationState: string,
): Promise<SyncResult[]> {
  return propagateAvatarUpdate(creatorId, avatarModel, animationState);
}

// ── Event routing ─────────────────────────────────────────────────────────────

/**
 * Route a virtual event to all worlds that support the given asset type.
 * Records a dispatch log entry for each world targeted.
 * Returns the list of world IDs the event was dispatched to.
 */
export function routeEventToWorlds(eventId: string, assetType: string): string[] {
  const worlds = worldsByAssetType(assetType);
  if (worlds.length === 0) return [];

  const db   = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO gateway_dispatches (event_id, world_id, dispatched_at)
    VALUES (?, ?, ?)
  `);
  const now = new Date().toISOString();

  for (const w of worlds) {
    stmt.run(eventId, w.world_id, now);
  }

  return worlds.map(w => w.world_id);
}

/** List dispatch records for a given event. */
export function listEventDispatches(eventId: string): { world_id: string; dispatched_at: string }[] {
  return getDb().prepare(
    `SELECT world_id, dispatched_at FROM gateway_dispatches WHERE event_id = ? ORDER BY dispatched_at`
  ).all(eventId) as { world_id: string; dispatched_at: string }[];
}

// ── Status ────────────────────────────────────────────────────────────────────

export interface GatewayStatus {
  activeWorlds:  number;
  totalAvatars:  number;
  totalEvents:   number;
  lastDispatchAt: string | null;
}

/** Aggregate gateway health and activity metrics. */
export function getGatewayStatus(): GatewayStatus {
  const db = getDb();

  const activeWorlds = (db.prepare(
    `SELECT COUNT(*) as c FROM multiverse_worlds WHERE status = 'active'`
  ).get() as { c: number }).c;

  const totalAvatars = (db.prepare(
    `SELECT COUNT(DISTINCT creator_id) as c FROM avatar_states`
  ).get() as { c: number }).c;

  const totalEvents = (db.prepare(
    `SELECT COUNT(*) as c FROM virtual_events WHERE is_active = 1`
  ).get() as { c: number }).c;

  const lastRow = db.prepare(
    `SELECT MAX(dispatched_at) as t FROM gateway_dispatches`
  ).get() as { t: string | null };

  return {
    activeWorlds,
    totalAvatars,
    totalEvents,
    lastDispatchAt: lastRow.t,
  };
}
