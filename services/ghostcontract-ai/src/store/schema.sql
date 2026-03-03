-- GhostContractAI SQLite Schema
-- On-disk store for job history, learning outcomes, and repo index.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Jobs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  target_paths  TEXT NOT NULL,   -- JSON array
  constraints   TEXT NOT NULL,   -- JSON
  context       TEXT NOT NULL,   -- JSON
  initiator     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  finished_at   TEXT,
  plan_steps    TEXT,            -- JSON array
  result        TEXT,            -- JSON
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status    ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type      ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created   ON jobs(created_at);

-- ─── Plan Steps ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_steps (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  label       TEXT NOT NULL,
  tool        TEXT NOT NULL,
  args        TEXT NOT NULL,   -- JSON
  status      TEXT NOT NULL DEFAULT 'pending',
  started_at  TEXT,
  finished_at TEXT,
  output      TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_steps_job ON plan_steps(job_id);

-- ─── Evidence ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evidence (
  job_id          TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  generated_at    TEXT NOT NULL,
  tool_versions   TEXT NOT NULL,  -- JSON
  touched_files   TEXT NOT NULL,  -- JSON
  patch_diff      TEXT,
  compile_logs    TEXT,
  test_logs       TEXT,
  audit_logs      TEXT,
  sha256_manifest TEXT NOT NULL,
  signature       TEXT
);

-- ─── Learner: Outcome Records ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS learner_outcomes (
  id              TEXT PRIMARY KEY,
  job_type        TEXT NOT NULL,
  failure_sig     TEXT,           -- hash of failure pattern (compile error, slither finding, etc.)
  strategy_used   TEXT NOT NULL,  -- which agent strategy was chosen
  success         INTEGER NOT NULL DEFAULT 0,  -- 1=success, 0=fail
  latency_ms      INTEGER,
  recorded_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learner_type     ON learner_outcomes(job_type);
CREATE INDEX IF NOT EXISTS idx_learner_failure  ON learner_outcomes(failure_sig);

-- ─── Learner: Strategy Bandit Stats ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS strategy_bandit (
  job_type    TEXT NOT NULL,
  strategy    TEXT NOT NULL,
  trials      INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (job_type, strategy)
);

-- ─── Repo Index ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repo_index (
  path        TEXT PRIMARY KEY,
  sha256      TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  symbols     TEXT,            -- JSON array of top-level symbols
  pragma      TEXT,            -- solidity pragma if applicable
  indexed_at  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repo_index_sha ON repo_index(sha256);

-- ─── Queue ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_queue (
  job_id      TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  enqueued_at INTEGER NOT NULL  -- epoch ms
);
