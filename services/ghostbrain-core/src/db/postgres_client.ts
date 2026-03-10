/**
 * GhostBrain Core — PostgreSQL Operational Memory Client
 *
 * Provides a connection pool to the PostgreSQL operational memory database.
 * Gracefully degrades when GHOSTBRAIN_DB_URL is not set: logs a warning and
 * skips all writes (all query functions return empty results).
 *
 * Env vars:
 *   GHOSTBRAIN_DB_URL  — PostgreSQL connection URL
 *                        e.g. postgresql://ghostbrain:pass@localhost:5432/ghostbrain
 */

import { Pool } from "pg";

let _pool: Pool | null = null;
let _healthy = false;

export function isPostgresReady(): boolean {
  return _healthy && _pool !== null;
}

export function getPool(): Pool | null {
  return _pool;
}

export async function initPostgres(): Promise<void> {
  const url = process.env.GHOSTBRAIN_DB_URL;
  if (!url) {
    console.warn(
      "[ghostbrain-postgres] GHOSTBRAIN_DB_URL not set — PostgreSQL operational memory disabled." +
      " Set GHOSTBRAIN_DB_URL to enable structured event/decision persistence.",
    );
    return;
  }

  _pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "ghostbrain-core",
  });

  _pool.on("error", (err) => {
    console.error("[ghostbrain-postgres] Pool error:", err.message);
    _healthy = false;
  });

  // Validate connection
  let client;
  try {
    client = await _pool.connect();
    await client.query("SELECT 1");
    _healthy = true;
    console.info("[ghostbrain-postgres] PostgreSQL operational memory connected");
  } catch (err) {
    console.error("[ghostbrain-postgres] Connection failed — disabling PostgreSQL layer:", err);
    await _pool.end().catch(() => null);
    _pool    = null;
    _healthy = false;
  } finally {
    client?.release();
  }
}

/**
 * Run a SELECT query, returns rows or empty array on failure/no connection.
 */
export async function query<T extends Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  if (!_pool || !_healthy) return [];
  try {
    const result = await _pool.query<T>(sql, params);
    return result.rows;
  } catch (err) {
    console.error("[ghostbrain-postgres] query error:", (err as Error).message);
    return [];
  }
}

/**
 * Run an INSERT/UPDATE/DELETE, returns rowCount (0 on failure).
 */
export async function execute(sql: string, params?: unknown[]): Promise<number> {
  if (!_pool || !_healthy) return 0;
  try {
    const result = await _pool.query(sql, params);
    return result.rowCount ?? 0;
  } catch (err) {
    console.error("[ghostbrain-postgres] execute error:", (err as Error).message);
    return 0;
  }
}

export async function closePostgres(): Promise<void> {
  if (_pool) {
    await _pool.end().catch(() => null);
    _pool    = null;
    _healthy = false;
  }
}
