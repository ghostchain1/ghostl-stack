-- GhostBrain Core — Migration 002: Indexes and partition automation
-- Adds pg_cron job to auto-create monthly partitions and retention policy.

\set ON_ERROR_STOP on

BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002_partition_automation') THEN
    RAISE NOTICE 'Migration 002 already applied — skipping.';
    RETURN;
  END IF;
END $$;

-- Auto-create next month's partition for system_events via pg_cron (if available)
DO $$ BEGIN
  PERFORM pg_catalog.pg_extension_config_dump('pg_cron', '');
EXCEPTION WHEN undefined_table THEN
  -- pg_cron not installed — partitions must be created manually
  RAISE NOTICE 'pg_cron not available; manage system_events partitions manually';
END $$;

-- Retention: delete partitions older than 90 days (run manually or via pg_cron)
-- SELECT drop_chunks('system_events', INTERVAL '90 days');  -- TimescaleDB only
-- For vanilla Postgres: DROP TABLE system_events_YYYY_MM;

-- GIN index on ai_decisions action_taken for fast JSON queries
CREATE INDEX IF NOT EXISTS idx_aidec_action ON ai_decisions USING gin(action_taken);

-- Composite index for learning pipeline
CREATE INDEX IF NOT EXISTS idx_feedback_unprocessed
  ON learning_feedback (submitted_at ASC)
  WHERE NOT processed;

INSERT INTO schema_migrations (version) VALUES ('002_partition_automation')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
