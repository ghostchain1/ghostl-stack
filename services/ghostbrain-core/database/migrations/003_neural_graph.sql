-- GhostBrain Core — Migration 003: Neural Memory Graph + Audit Log
-- Adds the full three-layer neural memory database tables:
--
--   memory_graph_nodes     — causal-graph nodes (event | cause | action | outcome)
--   memory_graph_edges     — directed edges between nodes
--   ghostbrain_audit_log   — HMAC-signed tamper-proof AI decision audit log
--
-- Run with: psql $GHOSTBRAIN_DB_URL -f 003_neural_graph.sql
-- Idempotent: safe to re-run.

\set ON_ERROR_STOP on

BEGIN;

-- Skip if already applied
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '003_neural_graph') THEN
    RAISE NOTICE 'Migration 003_neural_graph already applied — skipping.';
    RETURN;
  END IF;
END $$;

-- ─── Enum for graph node kinds ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE graph_node_kind AS ENUM ('event', 'cause', 'action', 'outcome');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Enum for graph edge relations ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE graph_edge_relation AS ENUM ('caused_by', 'led_to', 'resolved_by', 'resulted_in');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 1. memory_graph_nodes ────────────────────────────────────────────────────
-- Nodes in the cause-effect causal graph.
-- One node per event, cause, action, or outcome recorded by GhostBrain.
CREATE TABLE IF NOT EXISTS memory_graph_nodes (
  id            TEXT             NOT NULL PRIMARY KEY,   -- file-graph node ID (e.g. "event-1709123456789-1")
  kind          graph_node_kind  NOT NULL,
  label         TEXT             NOT NULL,               -- e.g. "oom_kill", "restart", "container_stable"
  resource_id   TEXT             NOT NULL,               -- container/vm/service/validator ID
  layer         TEXT             NOT NULL,               -- hypervisor | vm | container | chain | l1 | l2 | l3
  payload       JSONB            NOT NULL DEFAULT '{}',  -- arbitrary context
  recorded_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mgn_label       ON memory_graph_nodes (label, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mgn_resource    ON memory_graph_nodes (resource_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mgn_kind        ON memory_graph_nodes (kind, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mgn_payload     ON memory_graph_nodes USING gin(payload);
CREATE INDEX IF NOT EXISTS idx_mgn_layer       ON memory_graph_nodes (layer, recorded_at DESC);

-- ─── 2. memory_graph_edges ────────────────────────────────────────────────────
-- Directed causal edges between nodes.
-- event → cause     (relation: caused_by)
-- cause → action    (relation: led_to)
-- action → outcome  (relation: resulted_in | resolved_by)
CREATE TABLE IF NOT EXISTS memory_graph_edges (
  id            UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id       TEXT                 NOT NULL REFERENCES memory_graph_nodes(id) ON DELETE CASCADE,
  to_id         TEXT                 NOT NULL REFERENCES memory_graph_nodes(id) ON DELETE CASCADE,
  relation      graph_edge_relation  NOT NULL,
  confidence    NUMERIC(6,4)         NOT NULL DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
  recorded_at   TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mge_from       ON memory_graph_edges (from_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mge_to         ON memory_graph_edges (to_id);
CREATE INDEX IF NOT EXISTS idx_mge_relation   ON memory_graph_edges (relation, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mge_confidence ON memory_graph_edges (confidence DESC);

-- ─── 3. ghostbrain_audit_log ──────────────────────────────────────────────────
-- Tamper-proof HMAC-SHA256 signed audit log for every AI decision.
-- Signed over: ts|agent|decision_type|resource_id|rationale|action_hash
-- Verification: recompute HMAC with GHOSTBRAIN_AUDIT_HMAC_KEY and compare.
CREATE TABLE IF NOT EXISTS ghostbrain_audit_log (
  id                   TEXT         NOT NULL PRIMARY KEY,  -- SHA-256(signature:ts) truncated 24 chars
  recorded_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  agent                TEXT         NOT NULL,              -- GhostOptimizer | GhostRepairBot | ...
  decision_type        TEXT         NOT NULL,              -- repair | predict | rebalance | alert | evolve
  resource_id          TEXT         NOT NULL,
  layer                TEXT,
  rationale            TEXT         NOT NULL,
  action_taken         JSONB        NOT NULL DEFAULT '{}',
  action_hash          TEXT         NOT NULL,              -- SHA-256(JSON(action_taken)) for integrity
  signature            TEXT         NOT NULL,              -- HMAC-SHA256 hex | "unsigned"
  signed_key_present   BOOLEAN      NOT NULL DEFAULT false -- false = no GHOSTBRAIN_AUDIT_HMAC_KEY at sign time
);

CREATE INDEX IF NOT EXISTS idx_gal_agent     ON ghostbrain_audit_log (agent, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gal_decision  ON ghostbrain_audit_log (decision_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gal_resource  ON ghostbrain_audit_log (resource_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gal_unsigned  ON ghostbrain_audit_log (signed_key_present) WHERE NOT signed_key_present;
CREATE INDEX IF NOT EXISTS idx_gal_at        ON ghostbrain_audit_log (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gal_action    ON ghostbrain_audit_log USING gin(action_taken);

-- ─── Helper view: recent audit with integrity flag ────────────────────────────
CREATE OR REPLACE VIEW v_audit_recent AS
  SELECT
    id,
    recorded_at,
    agent,
    decision_type,
    resource_id,
    layer,
    rationale,
    signature,
    signed_key_present,
    CASE WHEN signature = 'unsigned' THEN 'no_key' ELSE 'signed' END AS integrity_status
  FROM ghostbrain_audit_log
  ORDER BY recorded_at DESC
  LIMIT 500;

-- ─── Helper view: top successful causal chains ────────────────────────────────
CREATE OR REPLACE VIEW v_top_repair_chains AS
  SELECT
    n_event.label   AS event_label,
    n_event.layer   AS layer,
    n_action.label  AS action_label,
    n_out.label     AS outcome_label,
    AVG(e1.confidence)::numeric(6,4) AS avg_confidence,
    COUNT(*)        AS observed_count
  FROM memory_graph_edges e1
  JOIN memory_graph_nodes n_event  ON n_event.id  = e1.from_id AND n_event.kind  = 'event'
  JOIN memory_graph_nodes n_cause  ON n_cause.id  = e1.to_id
  JOIN memory_graph_edges e2 ON e2.from_id = n_cause.id
  JOIN memory_graph_nodes n_action ON n_action.id = e2.to_id
  JOIN memory_graph_edges e3 ON e3.from_id = n_action.id
  JOIN memory_graph_nodes n_out    ON n_out.id    = e3.to_id
  WHERE (n_out.payload->>'success')::boolean = true
  GROUP BY n_event.label, n_event.layer, n_action.label, n_out.label
  ORDER BY observed_count DESC, avg_confidence DESC
  LIMIT 200;

-- ─── Mark migration as applied ────────────────────────────────────────────────
INSERT INTO schema_migrations (version)
VALUES ('003_neural_graph')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
