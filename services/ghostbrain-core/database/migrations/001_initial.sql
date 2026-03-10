-- GhostBrain Core — Migration 001: Initial Schema
-- Run with: psql $GHOSTBRAIN_DB_URL -f 001_initial.sql
-- Idempotent: safe to re-run.

\set ON_ERROR_STOP on

BEGIN;

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Skip if already applied
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001_initial') THEN
    RAISE NOTICE 'Migration 001_initial already applied — skipping.';
    RETURN;
  END IF;
END $$;

\i ../postgres_schema.sql

INSERT INTO schema_migrations (version) VALUES ('001_initial')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
