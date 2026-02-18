import crypto from 'node:crypto';
import type { SqliteDb } from '../db/sqlite.js';
import type { Execution, Fix } from '../types/hgop.js';
import { runPreflight } from './preflight.js';

const now = () => Math.floor(Date.now() / 1000);

export function recordExecution(db: SqliteDb, proposalId: string, fix: Fix, outcome: Execution['outcome'], logs: unknown) {
  const execution_id = `exec_${crypto.randomUUID()}`;
  const started_ts = now();
  const finished_ts = now();
  db.prepare(
    `INSERT INTO executions (execution_id, proposal_id, fix_id, started_ts, finished_ts, outcome, logs_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(execution_id, proposalId, fix.fix_id, started_ts, finished_ts, outcome, JSON.stringify(logs || {}));

  const row = db.prepare('SELECT * FROM executions WHERE execution_id = ?').get(execution_id) as any;
  const exec: Execution = {
    execution_id: String(row.execution_id),
    proposal_id: String(row.proposal_id),
    fix_id: String(row.fix_id),
    started_ts: Number(row.started_ts),
    finished_ts: row.finished_ts ? Number(row.finished_ts) : null,
    outcome: row.outcome,
    logs_json: JSON.parse(String(row.logs_json || '{}'))
  };
  return exec;
}

export function executeFix(db: SqliteDb, proposalId: string, fix: Fix) {
  const preflight = runPreflight(fix);
  if (!preflight.ok) {
    return recordExecution(db, proposalId, fix, 'blocked', { reason: 'preflight_failed', preflight });
  }
  // v1 executor is intentionally non-destructive: it records intent and returns blocked unless you
  // build a dedicated executor plugin with explicit allowlists.
  return recordExecution(db, proposalId, fix, 'blocked', {
    reason: 'executor_not_configured',
    message: 'HGOP v1 is proposal-first. Configure a dedicated executor with explicit allowlists for devnet apply.',
    preflight
  });
}
