/**
 * Avatar World Sync — tracks and propagates creator 3D avatar state across
 * connected virtual worlds.  Avatar model URIs and animation states are stored
 * per (creator_id, world_id) pair so each world can receive world-specific variants.
 */

import { getDb } from '../backend/src/db/index.js';
import { listActiveWorlds } from './world_registry.js';

export interface AvatarState {
  creator_id:      string;
  world_id:        string;
  avatar_model:    string;
  animation_state: string;
  updated_at:      string;
}

/** Upsert avatar state for a specific (creator, world) pair. */
export function syncAvatarToWorld(
  creatorId:      string,
  worldId:        string,
  avatarModel:    string,
  animationState: string,
): AvatarState {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO avatar_states (creator_id, world_id, avatar_model, animation_state, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(creator_id, world_id) DO UPDATE SET
      avatar_model    = excluded.avatar_model,
      animation_state = excluded.animation_state,
      updated_at      = excluded.updated_at
  `).run(creatorId, worldId, avatarModel, animationState, now);

  return getAvatarState(creatorId, worldId)!;
}

/** Get avatar state for a (creator, world) pair. */
export function getAvatarState(creatorId: string, worldId: string): AvatarState | undefined {
  return getDb().prepare(
    `SELECT * FROM avatar_states WHERE creator_id = ? AND world_id = ?`
  ).get(creatorId, worldId) as AvatarState | undefined;
}

/** List all world states for a creator. */
export function listAvatarStates(creatorId: string): AvatarState[] {
  return getDb().prepare(
    `SELECT * FROM avatar_states WHERE creator_id = ? ORDER BY updated_at DESC`
  ).all(creatorId) as AvatarState[];
}

export interface SyncResult {
  worldId: string;
  status:  'synced' | 'skipped' | 'error';
  error?:  string;
}

/**
 * Propagate a new avatar model + animation state to ALL active worlds.
 * Each world gets the same model; world-specific overrides can be applied
 * afterward via syncAvatarToWorld().
 */
export function propagateAvatarUpdate(
  creatorId:      string,
  avatarModel:    string,
  animationState: string,
): SyncResult[] {
  const worlds  = listActiveWorlds();
  const results: SyncResult[] = [];

  for (const world of worlds) {
    try {
      syncAvatarToWorld(creatorId, world.world_id, avatarModel, animationState);
      results.push({ worldId: world.world_id, status: 'synced' });
    } catch (err) {
      results.push({
        worldId: world.world_id,
        status: 'error',
        error:  err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/** Remove avatar data for a creator from a specific world. */
export function removeAvatarFromWorld(creatorId: string, worldId: string): boolean {
  const result = getDb().prepare(
    `DELETE FROM avatar_states WHERE creator_id = ? AND world_id = ?`
  ).run(creatorId, worldId);
  return result.changes > 0;
}
