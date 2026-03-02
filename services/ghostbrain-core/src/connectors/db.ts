/**
 * GhostBrain Core — Postgres Connector
 *
 * Persists incidents, change plans, evidence, and audit log entries.
 * SECURITY: Connection string comes from env; never logged.
 */

import pg from "pg";
import { POSTGRES_URL } from "../config.js";
import { logger } from "../logger.js";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: POSTGRES_URL, max: 10 });
    _pool.on("error", (err) => {
      logger.error("Postgres pool error", { err: String(err) });
    });
  }
  return _pool;
}

export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(sql, params);
}

export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

// ─── Schema bootstrap ─────────────────────────────────────────────────────────
export async function ensureSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS incidents (
      incident_id     TEXT PRIMARY KEY,
      opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      severity        TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open',
      title           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      signals         JSONB NOT NULL DEFAULT '[]',
      evidence_refs   JSONB NOT NULL DEFAULT '[]',
      plan_id         TEXT,
      resolved_at     TIMESTAMPTZ,
      root_cause      TEXT
    );

    CREATE TABLE IF NOT EXISTS change_plans (
      plan_id         TEXT PRIMARY KEY,
      incident_id     TEXT NOT NULL REFERENCES incidents(incident_id),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status          TEXT NOT NULL DEFAULT 'draft',
      title           TEXT NOT NULL,
      rationale       TEXT NOT NULL DEFAULT '',
      steps           JSONB NOT NULL DEFAULT '[]',
      blast_radius    INTEGER NOT NULL DEFAULT 1,
      canary_step     JSONB,
      policy_decision TEXT,
      policy_conditions JSONB DEFAULT '[]',
      evidence_refs   JSONB NOT NULL DEFAULT '[]',
      executed_at     TIMESTAMPTZ,
      completed_at    TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS evidence (
      evidence_id   TEXT PRIMARY KEY,
      incident_id   TEXT,
      plan_id       TEXT,
      kind          TEXT NOT NULL,
      description   TEXT NOT NULL,
      stored_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload       JSONB NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      log_id        BIGSERIAL PRIMARY KEY,
      logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor         TEXT NOT NULL,
      action        TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id   TEXT NOT NULL,
      details       JSONB NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS agent_registry (
      agent_id         TEXT PRIMARY KEY,
      role             TEXT NOT NULL,
      capabilities     JSONB NOT NULL DEFAULT '[]',
      resource_scopes  JSONB NOT NULL DEFAULT '[]',
      nats_subject     TEXT NOT NULL,
      registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      healthy          BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);
    CREATE INDEX IF NOT EXISTS plans_incident_idx ON change_plans(incident_id);
    CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log(resource_type, resource_id);
  `);

  logger.info("Database schema ensured");
}
