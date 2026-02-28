import crypto from 'node:crypto';
import type { SqliteDb } from '../../db/sqlite.js';
import { GhostDnsClient } from './ghostdns.client.js';

const now = () => Math.floor(Date.now() / 1000);

export async function playbookReconcile(db: SqliteDb, client: GhostDnsClient, actor: string, mode: string) {
  const response = await client.reconcile();
  const diffHash = crypto.createHash('sha256').update(JSON.stringify(response)).digest('hex');
  db.prepare(
    `INSERT INTO ghostdns_changes (ts, actor, mode, diff_hash, approved, applied, rollback_ref) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(now(), actor, mode, diffHash, mode !== 'mainnet' ? 1 : 0, 1, null);
  return response;
}

export async function playbookSafeReload(db: SqliteDb, client: GhostDnsClient, actor: string, mode: string) {
  const response = await client.reload();
  const diffHash = crypto.createHash('sha256').update(JSON.stringify(response)).digest('hex');
  db.prepare(
    `INSERT INTO ghostdns_changes (ts, actor, mode, diff_hash, approved, applied, rollback_ref) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(now(), actor, mode, diffHash, mode !== 'mainnet' ? 1 : 0, 1, null);
  return response;
}

export function playbookRollbackLastGood(db: SqliteDb, actor: string, mode: string, rollbackRef: string) {
  db.prepare(
    `INSERT INTO ghostdns_changes (ts, actor, mode, diff_hash, approved, applied, rollback_ref) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(now(), actor, mode, `rollback:${rollbackRef}`, 1, 1, rollbackRef);
  return { ok: true, rollbackRef };
}
