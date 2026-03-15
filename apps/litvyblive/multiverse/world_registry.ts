/**
 * World Registry — SQLite-backed registry of virtual worlds connected to
 * the GhostChain Multiverse layer.  Worlds can be registered by platform
 * admin, toggled active/inactive, and queried by asset type.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';

export interface World {
  world_id:         string;
  world_name:       string;
  api_endpoint:     string;
  supported_assets: string[];  // e.g. ['avatar', 'nft', 'ticket']
  status:           'active' | 'inactive';
  created_at:       string;
}

interface WorldRow {
  world_id:         string;
  world_name:       string;
  api_endpoint:     string;
  supported_assets: string;   // JSON string in DB
  status:           string;
  created_at:       string;
}

function rowToWorld(r: WorldRow): World {
  return {
    world_id:         r.world_id,
    world_name:       r.world_name,
    api_endpoint:     r.api_endpoint,
    supported_assets: JSON.parse(r.supported_assets ?? '[]') as string[],
    status:           r.status as 'active' | 'inactive',
    created_at:       r.created_at,
  };
}

/** Register a new virtual world. */
export function registerWorld(
  worldName:       string,
  apiEndpoint:     string,
  supportedAssets: string[],
): World {
  const db = getDb();
  const worldId  = uuid();
  const now      = new Date().toISOString();
  db.prepare(`
    INSERT INTO multiverse_worlds (world_id, world_name, api_endpoint, supported_assets, status, created_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(worldId, worldName, apiEndpoint, JSON.stringify(supportedAssets), now);
  return getWorldById(worldId)!;
}

/** Get a world by its ID. */
export function getWorldById(worldId: string): World | undefined {
  const row = getDb().prepare(
    `SELECT * FROM multiverse_worlds WHERE world_id = ?`
  ).get(worldId) as WorldRow | undefined;
  return row ? rowToWorld(row) : undefined;
}

/** List all active worlds. */
export function listActiveWorlds(): World[] {
  const rows = getDb().prepare(
    `SELECT * FROM multiverse_worlds WHERE status = 'active' ORDER BY created_at DESC`
  ).all() as WorldRow[];
  return rows.map(rowToWorld);
}

/** List all worlds (active and inactive). */
export function listAllWorlds(page = 0, pageSize = 20): World[] {
  const rows = getDb().prepare(
    `SELECT * FROM multiverse_worlds ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(pageSize, page * pageSize) as WorldRow[];
  return rows.map(rowToWorld);
}

/** Toggle world active/inactive status. */
export function setWorldStatus(worldId: string, status: 'active' | 'inactive'): boolean {
  const result = getDb().prepare(
    `UPDATE multiverse_worlds SET status = ? WHERE world_id = ?`
  ).run(status, worldId);
  return result.changes > 0;
}

/** Update the supported asset types for a world. */
export function updateWorldAssets(worldId: string, supportedAssets: string[]): boolean {
  const result = getDb().prepare(
    `UPDATE multiverse_worlds SET supported_assets = ? WHERE world_id = ?`
  ).run(JSON.stringify(supportedAssets), worldId);
  return result.changes > 0;
}

/** List worlds that support a specific asset type. */
export function worldsByAssetType(assetType: string): World[] {
  const rows = getDb().prepare(
    `SELECT * FROM multiverse_worlds WHERE status = 'active' AND supported_assets LIKE ?`
  ).all(`%"${assetType}"%`) as WorldRow[];
  return rows.map(rowToWorld);
}
