-- GhostBrain ACG — Database Schema Migration
-- Run order: after existing ghostbrain migrations (incidents, change_plans, evidence)
-- All timestamps: UTC ISO 8601 stored as TEXT for portability

-- ── Change Proposals ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acg_proposals (
    proposal_id      TEXT PRIMARY KEY,
    status           TEXT NOT NULL DEFAULT 'draft',
    goal             TEXT NOT NULL,
    scope            JSONB NOT NULL DEFAULT '[]',
    risk_level       TEXT NOT NULL DEFAULT 'low',
    rollout_strategy TEXT NOT NULL DEFAULT 'none',
    triggered_by     TEXT NOT NULL,
    triggered_by_ref TEXT,
    rationale        TEXT,
    acceptance_criteria JSONB DEFAULT '[]',
    test_plan        JSONB DEFAULT '[]',
    security_plan    JSONB DEFAULT '[]',
    rollback_plan    JSONB DEFAULT '[]',
    branch_name      TEXT,
    pr_url           TEXT,
    patch_plan       JSONB,
    release_artifact JSONB,
    evidence_log     JSONB DEFAULT '[]',
    payload          JSONB,              -- full snapshot of ChangeProposal object
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_acg_proposals_status    ON acg_proposals(status);
CREATE INDEX IF NOT EXISTS idx_acg_proposals_created   ON acg_proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acg_proposals_triggered ON acg_proposals(triggered_by_ref);

-- ── Gate Results ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acg_gate_results (
    id           SERIAL PRIMARY KEY,
    proposal_id  TEXT NOT NULL REFERENCES acg_proposals(proposal_id) ON DELETE CASCADE,
    gate_kind    TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending', -- pending|running|passed|failed|skipped
    findings     JSONB DEFAULT '[]',
    output       TEXT DEFAULT '',
    duration_ms  INTEGER DEFAULT 0,
    started_at   TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_acg_gate_results_proposal ON acg_gate_results(proposal_id);
CREATE INDEX IF NOT EXISTS idx_acg_gate_results_status   ON acg_gate_results(status);

-- ── Audit Results ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acg_audit_results (
    id              SERIAL PRIMARY KEY,
    proposal_id     TEXT NOT NULL REFERENCES acg_proposals(proposal_id) ON DELETE CASCADE,
    tool            TEXT NOT NULL,
    ran_at          TEXT NOT NULL,
    exit_code       INTEGER DEFAULT 0,
    critical_count  INTEGER DEFAULT 0,
    high_count      INTEGER DEFAULT 0,
    medium_count    INTEGER DEFAULT 0,
    low_count       INTEGER DEFAULT 0,
    findings        JSONB DEFAULT '[]',
    raw_output_ref  TEXT
);

CREATE INDEX IF NOT EXISTS idx_acg_audit_proposal ON acg_audit_results(proposal_id);

-- ── Sentinel Observations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acg_sentinel_observations (
    observation_id         TEXT PRIMARY KEY,
    proposal_id            TEXT NOT NULL REFERENCES acg_proposals(proposal_id) ON DELETE CASCADE,
    observed_at            TEXT NOT NULL,
    window_seconds         INTEGER NOT NULL,
    slo_violations         JSONB DEFAULT '[]',
    error_rate_baseline    REAL DEFAULT 0,
    error_rate_current     REAL DEFAULT 0,
    latency_p99_baseline   REAL DEFAULT 0,
    latency_p99_current    REAL DEFAULT 0,
    action                 TEXT NOT NULL DEFAULT 'none',
    action_reason          TEXT
);

CREATE INDEX IF NOT EXISTS idx_acg_sentinel_proposal ON acg_sentinel_observations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_acg_sentinel_observed ON acg_sentinel_observations(observed_at DESC);

-- ── ACG Event Log (append-only) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acg_events (
    event_id     TEXT PRIMARY KEY,
    proposal_id  TEXT NOT NULL,
    phase        TEXT NOT NULL,
    level        TEXT NOT NULL DEFAULT 'info',
    message      TEXT NOT NULL,
    data         JSONB,
    occurred_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_acg_events_proposal  ON acg_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_acg_events_occurred  ON acg_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_acg_events_level     ON acg_events(level);
