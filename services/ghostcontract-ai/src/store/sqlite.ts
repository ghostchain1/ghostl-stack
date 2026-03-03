/**
 * GhostContractAI — SQLite Store
 *
 * On-disk persistence for jobs, plan steps, evidence, learner outcomes,
 * strategy bandit stats, and the repo index.
 *
 * Uses better-sqlite3 for synchronous, low-latency access.
 * All writes are synchronous to ensure atomicity.
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Job,
  JobResult,
  JobStatus,
  PlanStep,
  JobEvidence,
} from "../types/jobs.js";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let _db: Database.Database | null = null;

// ─── Initialization ───────────────────────────────────────────────────────────

export function initStore(dbPath: string): void {
  _db = new Database(dbPath, { verbose: undefined });
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  // Execute each statement separately
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
    _db.exec(stmt + ";");
  }
  logger.info("SQLite store initialized", { dbPath });
}

function db(): Database.Database {
  if (!_db) throw new Error("Store not initialized — call initStore() first");
  return _db;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export function insertJob(job: Job): void {
  db()
    .prepare(
      `INSERT INTO jobs
       (id, type, status, target_paths, constraints, context, initiator, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      job.id,
      job.type,
      job.status,
      JSON.stringify(job.targetPaths),
      JSON.stringify(job.constraints),
      JSON.stringify(job.context),
      job.initiator,
      job.createdAt,
    );
}

export function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra: { startedAt?: string; finishedAt?: string; error?: string } = {},
): void {
  db()
    .prepare(
      `UPDATE jobs SET status=?, started_at=COALESCE(?, started_at),
       finished_at=COALESCE(?, finished_at), error=COALESCE(?, error)
       WHERE id=?`,
    )
    .run(
      status,
      extra.startedAt ?? null,
      extra.finishedAt ?? null,
      extra.error ?? null,
      jobId,
    );
}

export function updateJobResult(jobId: string, result: JobResult): void {
  db()
    .prepare(`UPDATE jobs SET result=?, finished_at=? WHERE id=?`)
    .run(JSON.stringify(result), new Date().toISOString(), jobId);
}

export function updateJobPlanSteps(jobId: string, steps: PlanStep[]): void {
  db()
    .prepare(`UPDATE jobs SET plan_steps=? WHERE id=?`)
    .run(JSON.stringify(steps), jobId);
}

export function getJob(jobId: string): Job | undefined {
  const row = db()
    .prepare(`SELECT * FROM jobs WHERE id=?`)
    .get(jobId) as Record<string, unknown> | undefined;
  return row ? _rowToJob(row) : undefined;
}

export function listJobs(limit = 50, offset = 0): Job[] {
  const rows = db()
    .prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as Record<string, unknown>[];
  return rows.map(_rowToJob);
}

function _rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    type: row.type as Job["type"],
    status: row.status as JobStatus,
    targetPaths: JSON.parse(row.target_paths as string),
    constraints: JSON.parse(row.constraints as string),
    context: JSON.parse(row.context as string),
    initiator: row.initiator as string,
    createdAt: row.created_at as string,
    ...(row.started_at != null && { startedAt: row.started_at as string }),
    ...(row.finished_at != null && { finishedAt: row.finished_at as string }),
    ...(row.plan_steps != null && { planSteps: JSON.parse(row.plan_steps as string) }),
    ...(row.result != null && { result: JSON.parse(row.result as string) }),
    ...(row.error != null && { error: row.error as string }),
  };
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export function upsertEvidence(ev: JobEvidence): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO evidence
       (job_id, generated_at, tool_versions, touched_files, patch_diff,
        compile_logs, test_logs, audit_logs, sha256_manifest, signature)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ev.jobId,
      ev.generatedAt,
      JSON.stringify(ev.toolVersions),
      JSON.stringify(ev.touchedFiles),
      ev.patchDiff ?? null,
      ev.compileLogs ?? null,
      ev.testLogs ?? null,
      ev.auditLogs ?? null,
      ev.sha256Manifest,
      ev.signature ?? null,
    );
}

export function getEvidence(jobId: string): JobEvidence | undefined {
  const row = db()
    .prepare(`SELECT * FROM evidence WHERE job_id=?`)
    .get(jobId) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    jobId: row.job_id as string,
    generatedAt: row.generated_at as string,
    toolVersions: JSON.parse(row.tool_versions as string),
    touchedFiles: JSON.parse(row.touched_files as string),
    ...(row.patch_diff != null && { patchDiff: row.patch_diff as string }),
    ...(row.compile_logs != null && { compileLogs: row.compile_logs as string }),
    ...(row.test_logs != null && { testLogs: row.test_logs as string }),
    ...(row.audit_logs != null && { auditLogs: row.audit_logs as string }),
    sha256Manifest: row.sha256_manifest as string,
    ...(row.signature != null && { signature: row.signature as string }),
  };
}

// ─── Learner / Bandit ─────────────────────────────────────────────────────────

export function recordLearnerOutcome(
  id: string,
  jobType: string,
  strategyUsed: string,
  success: boolean,
  latencyMs: number,
  failureSig?: string,
): void {
  db()
    .prepare(
      `INSERT INTO learner_outcomes
       (id, job_type, failure_sig, strategy_used, success, latency_ms, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      jobType,
      failureSig ?? null,
      strategyUsed,
      success ? 1 : 0,
      latencyMs,
      new Date().toISOString(),
    );

  // Update bandit stats
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO strategy_bandit (job_type, strategy, trials, wins, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(job_type, strategy) DO UPDATE SET
         trials = trials + 1,
         wins   = wins + excluded.wins,
         updated_at = excluded.updated_at`,
    )
    .run(jobType, strategyUsed, success ? 1 : 0, now);
}

/**
 * UCB1 bandit: pick strategy with highest upper confidence bound.
 * Returns null when no data exists (caller falls back to default).
 */
export function pickBestStrategy(
  jobType: string,
  candidates: string[],
): string | null {
  const rows = db()
    .prepare(
      `SELECT strategy, trials, wins FROM strategy_bandit
       WHERE job_type=? AND strategy IN (${candidates.map(() => "?").join(",")})`,
    )
    .all(jobType, ...candidates) as { strategy: string; trials: number; wins: number }[];

  if (rows.length === 0) return null;

  const totalTrials = rows.reduce((s, r) => s + r.trials, 0) || 1;

  let best: string | null = null;
  let bestScore = -Infinity;
  for (const r of rows) {
    if (r.trials === 0) return r.strategy; // explore immediately
    const exploitation = r.wins / r.trials;
    const exploration = Math.sqrt((2 * Math.log(totalTrials)) / r.trials);
    const ucb = exploitation + exploration;
    if (ucb > bestScore) {
      bestScore = ucb;
      best = r.strategy;
    }
  }
  return best;
}

// ─── Repo Index ───────────────────────────────────────────────────────────────

export interface RepoIndexEntry {
  path: string;
  sha256: string;
  sizeBytes: number;
  symbols?: string[];
  pragma?: string;
}

export function upsertRepoIndex(entry: RepoIndexEntry): void {
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO repo_index (path, sha256, size_bytes, symbols, pragma, indexed_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         sha256=excluded.sha256, size_bytes=excluded.size_bytes,
         symbols=excluded.symbols, pragma=excluded.pragma,
         last_seen=excluded.last_seen`,
    )
    .run(
      entry.path,
      entry.sha256,
      entry.sizeBytes,
      entry.symbols ? JSON.stringify(entry.symbols) : null,
      entry.pragma ?? null,
      now,
      now,
    );
}

export function queryRepoIndex(pattern: string, limit = 20): RepoIndexEntry[] {
  const rows = db()
    .prepare(
      `SELECT path, sha256, size_bytes, symbols, pragma
       FROM repo_index WHERE path LIKE ? LIMIT ?`,
    )
    .all(`%${pattern}%`, limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    path: r.path as string,
    sha256: r.sha256 as string,
    sizeBytes: r.size_bytes as number,
    ...(r.symbols != null && { symbols: JSON.parse(r.symbols as string) }),
    ...(r.pragma != null && { pragma: r.pragma as string }),
  }));
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export function enqueueJob(jobId: string): void {
  db()
    .prepare(`INSERT OR IGNORE INTO job_queue (job_id, enqueued_at) VALUES (?, ?)`)
    .run(jobId, Date.now());
}

export function dequeueJob(): string | null {
  const row = db()
    .prepare(
      `SELECT job_id FROM job_queue ORDER BY enqueued_at ASC LIMIT 1`,
    )
    .get() as { job_id: string } | undefined;
  if (!row) return null;
  db().prepare(`DELETE FROM job_queue WHERE job_id=?`).run(row.job_id);
  return row.job_id;
}

export function queueDepth(): number {
  const row = db()
    .prepare(`SELECT COUNT(*) as cnt FROM job_queue`)
    .get() as { cnt: number };
  return row.cnt;
}

export function closeStore(): void {
  _db?.close();
  _db = null;
}
