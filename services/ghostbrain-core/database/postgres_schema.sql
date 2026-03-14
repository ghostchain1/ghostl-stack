-- GhostBrain Core — PostgreSQL Schema
-- Version: 1.0 | 2026-03-10
-- Stores all persistent AI memory layers for the GhostBrain autonomous system.
--
-- Tables:
--   system_events         Real-time infrastructure events ingested from all layers
--   task_patterns         Learned task→outcome mappings
--   ai_decisions          Audit log of every AI decision with outcome tracking
--   docker_metrics        Container resource snapshots (time-series)
--   vm_metrics            VM resource snapshots (time-series)
--   infrastructure_changes Governance-tracked infra changes and rollback info
--   repair_actions        Autonomous repair history with success/failure outcomes
--   learning_feedback     Human or automated feedback on AI decisions

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fast text similarity for memory_query

-- ─── ENUM types ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE layer_enum AS ENUM ('l1','l2','l3','hypervisor','vm','container','service','network','storage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE severity_enum AS ENUM ('info','warning','error','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE decision_outcome AS ENUM ('pending','success','failure','skipped','escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE repair_strategy AS ENUM ('restart','reallocate','clear_cache','redeploy','config_fix','scale_up','scale_down','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 1. system_events ─────────────────────────────────────────────────────────
-- Real-time event journal. High write rate — partitioned by month.
CREATE TABLE IF NOT EXISTS system_events (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  occurred_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  resource_id   TEXT          NOT NULL,           -- container name, vm id, chain node id
  layer         layer_enum    NOT NULL,
  category      TEXT          NOT NULL,           -- crash | oom | restart | spike | anomaly | governance
  label         TEXT          NOT NULL,           -- e.g. cpu_high, oom_kill, validator_offline
  severity      severity_enum NOT NULL DEFAULT 'info',
  payload       JSONB         NOT NULL DEFAULT '{}',
  embedding_id  TEXT,                             -- FK key into vector store (optional)
  chain_id      BIGINT,                           -- 14000101 | 901 | 903 | NULL
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_sysevt_resource ON system_events (resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sysevt_category ON system_events (category, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sysevt_severity  ON system_events (severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sysevt_payload   ON system_events USING gin(payload);

-- Partitions (create at least current + next month at deploy time)
CREATE TABLE IF NOT EXISTS system_events_2026_03 PARTITION OF system_events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS system_events_2026_04 PARTITION OF system_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS system_events_2026_05 PARTITION OF system_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- ─── 2. task_patterns ─────────────────────────────────────────────────────────
-- Learned "if event A → do action B" patterns, refined by feedback.
CREATE TABLE IF NOT EXISTS task_patterns (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key     TEXT          NOT NULL UNIQUE,  -- deterministic hash of trigger signature
  trigger_category TEXT         NOT NULL,
  trigger_label    TEXT         NOT NULL,
  recommended_action TEXT       NOT NULL,
  action_params    JSONB        NOT NULL DEFAULT '{}',
  observation_count BIGINT      NOT NULL DEFAULT 1,
  success_count    BIGINT       NOT NULL DEFAULT 0,
  failure_count    BIGINT       NOT NULL DEFAULT 0,
  avg_recovery_ms  NUMERIC(12,2) DEFAULT NULL,
  confidence       NUMERIC(6,4) GENERATED ALWAYS AS (
                     CASE WHEN observation_count = 0 THEN 0
                     ELSE ROUND(success_count::numeric / observation_count, 4) END
                   ) STORED,
  last_seen_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_pattern_trigger ON task_patterns (trigger_category, trigger_label);
CREATE INDEX IF NOT EXISTS idx_task_pattern_confidence ON task_patterns (confidence DESC);

-- ─── 3. ai_decisions ──────────────────────────────────────────────────────────
-- Full audit log of every GhostBrain autonomous decision.
CREATE TABLE IF NOT EXISTS ai_decisions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  decided_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  agent           TEXT          NOT NULL,          -- GhostOptimizer | GhostRepairBot | etc.
  decision_type   TEXT          NOT NULL,          -- repair | rebalance | predict | alert | evolve
  resource_id     TEXT          NOT NULL,
  layer           layer_enum    NOT NULL,
  rationale       TEXT          NOT NULL,
  confidence      NUMERIC(6,4)  NOT NULL DEFAULT 0,
  action_taken    JSONB         NOT NULL DEFAULT '{}',
  outcome         decision_outcome NOT NULL DEFAULT 'pending',
  outcome_detail  TEXT,
  outcome_at      TIMESTAMPTZ,
  duration_ms     INTEGER,
  requires_human  BOOLEAN       NOT NULL DEFAULT false,
  human_reviewed  BOOLEAN       NOT NULL DEFAULT false,
  policy_guard    TEXT          NOT NULL DEFAULT 'ALLOW', -- ALLOW | DENY | REQUIRE_HUMAN_APPROVAL
  chain_id        BIGINT
);

CREATE INDEX IF NOT EXISTS idx_aidec_agent    ON ai_decisions (agent, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_aidec_outcome  ON ai_decisions (outcome, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_aidec_resource ON ai_decisions (resource_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_aidec_human    ON ai_decisions (requires_human) WHERE requires_human = true;

-- ─── 4. docker_metrics ────────────────────────────────────────────────────────
-- Time-series container resource snapshots for trend analysis.
CREATE TABLE IF NOT EXISTS docker_metrics (
  id              BIGSERIAL     PRIMARY KEY,
  sampled_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  container_id    TEXT          NOT NULL,
  container_name  TEXT          NOT NULL,
  image           TEXT,
  cpu_pct         NUMERIC(6,2)  NOT NULL,
  mem_pct         NUMERIC(6,2)  NOT NULL,
  mem_bytes       BIGINT,
  net_rx_bytes    BIGINT,
  net_tx_bytes    BIGINT,
  blk_read_bytes  BIGINT,
  blk_write_bytes BIGINT,
  restarts        INTEGER       NOT NULL DEFAULT 0,
  healthy         BOOLEAN       NOT NULL DEFAULT true,
  labels          JSONB         NOT NULL DEFAULT '{}'
);

SELECT create_hypertable('docker_metrics', 'sampled_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_docker_metrics_container ON docker_metrics (container_name, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_docker_metrics_cpu       ON docker_metrics (cpu_pct DESC, sampled_at DESC);

-- ─── 5. vm_metrics ────────────────────────────────────────────────────────────
-- Time-series VM resource snapshots.
CREATE TABLE IF NOT EXISTS vm_metrics (
  id              BIGSERIAL     PRIMARY KEY,
  sampled_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  vm_id           TEXT          NOT NULL,
  vm_name         TEXT          NOT NULL,
  host            TEXT,
  cpu_pct         NUMERIC(6,2)  NOT NULL,
  mem_pct         NUMERIC(6,2)  NOT NULL,
  disk_io_pct     NUMERIC(6,2)  NOT NULL DEFAULT 0,
  net_mbps        NUMERIC(10,3) NOT NULL DEFAULT 0,
  uptime_s        BIGINT,
  state           TEXT          NOT NULL DEFAULT 'running', -- running | stopped | error | migrating
  meta            JSONB         NOT NULL DEFAULT '{}'
);

SELECT create_hypertable('vm_metrics', 'sampled_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_vm_metrics_vm   ON vm_metrics (vm_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_vm_metrics_cpu  ON vm_metrics (cpu_pct DESC, sampled_at DESC);

-- ─── 6. infrastructure_changes ────────────────────────────────────────────────
-- Governance-tracked infra changes with rollback metadata.
CREATE TABLE IF NOT EXISTS infrastructure_changes (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  change_type     TEXT          NOT NULL,   -- deploy | scale | resize | config | migrate | rollback
  resource_id     TEXT          NOT NULL,
  layer           layer_enum    NOT NULL,
  initiator       TEXT          NOT NULL,   -- agent name or "human"
  description     TEXT          NOT NULL,
  before_state    JSONB         NOT NULL DEFAULT '{}',
  after_state     JSONB         NOT NULL DEFAULT '{}',
  rollback_plan   JSONB         NOT NULL DEFAULT '{}',
  rolled_back     BOOLEAN       NOT NULL DEFAULT false,
  rolled_back_at  TIMESTAMPTZ,
  policy_hash     TEXT,
  ai_decision_id  UUID REFERENCES ai_decisions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_infra_change_resource ON infrastructure_changes (resource_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_infra_change_type     ON infrastructure_changes (change_type, changed_at DESC);

-- ─── 7. repair_actions ────────────────────────────────────────────────────────
-- History of every autonomous repair with outcome and learnings.
CREATE TABLE IF NOT EXISTS repair_actions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  repaired_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  resource_id     TEXT          NOT NULL,
  layer           layer_enum    NOT NULL,
  trigger_event   TEXT          NOT NULL,  -- event category:label that triggered repair
  strategy        repair_strategy NOT NULL,
  params          JSONB         NOT NULL DEFAULT '{}',
  success         BOOLEAN       NOT NULL,
  recovery_ms     INTEGER,
  error_detail    TEXT,
  retry_count     SMALLINT      NOT NULL DEFAULT 0,
  agent           TEXT          NOT NULL DEFAULT 'GhostRepairBot',
  ai_decision_id  UUID REFERENCES ai_decisions(id) ON DELETE SET NULL,
  pattern_id      UUID REFERENCES task_patterns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_resource ON repair_actions (resource_id, repaired_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_success  ON repair_actions (success, repaired_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_strategy ON repair_actions (strategy, success);

-- ─── 8. learning_feedback ─────────────────────────────────────────────────────
-- Human or automated feedback on AI decisions — feeds self-evolution engine.
CREATE TABLE IF NOT EXISTS learning_feedback (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  source          TEXT          NOT NULL,  -- human | auto | governance
  ai_decision_id  UUID REFERENCES ai_decisions(id) ON DELETE CASCADE,
  repair_id       UUID REFERENCES repair_actions(id) ON DELETE CASCADE,
  pattern_id      UUID REFERENCES task_patterns(id) ON DELETE CASCADE,
  rating          SMALLINT      CHECK (rating BETWEEN -1 AND 1),  -- -1 bad | 0 neutral | 1 good
  notes           TEXT,
  correction      JSONB,        -- suggested alternative action
  processed       BOOLEAN       NOT NULL DEFAULT false,
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feedback_decision ON learning_feedback (ai_decision_id);
CREATE INDEX IF NOT EXISTS idx_feedback_processed ON learning_feedback (processed) WHERE NOT processed;

-- ─── Helper views ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_top_patterns AS
  SELECT pattern_key, trigger_category, trigger_label, recommended_action,
         confidence, observation_count, avg_recovery_ms
  FROM task_patterns
  ORDER BY confidence DESC, observation_count DESC
  LIMIT 100;

CREATE OR REPLACE VIEW v_recent_repairs AS
  SELECT r.repaired_at, r.resource_id, r.layer, r.trigger_event,
         r.strategy, r.success, r.recovery_ms, r.agent
  FROM repair_actions r
  ORDER BY r.repaired_at DESC
  LIMIT 500;

CREATE OR REPLACE VIEW v_decision_audit AS
  SELECT d.decided_at, d.agent, d.decision_type, d.resource_id,
         d.outcome, d.policy_guard, d.requires_human, d.human_reviewed,
         d.duration_ms
  FROM ai_decisions d
  ORDER BY d.decided_at DESC
  LIMIT 1000;
