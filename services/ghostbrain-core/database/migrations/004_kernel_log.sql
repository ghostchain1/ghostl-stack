-- GhostBrain Core — Migration 004: Kernel Action Log
--
-- Adds the persistent audit table for all commands dispatched through the
-- AI Kernel command bus (Layer 6).  Every action taken by DockerManager,
-- VMManager, or SystemManager is recorded here with its outcome.
--
-- Run with: psql $GHOSTBRAIN_DB_URL -f 004_kernel_log.sql
-- Idempotent: safe to re-run.

\set ON_ERROR_STOP on

BEGIN;

-- Skip if already applied
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '004_kernel_log') THEN
    RAISE NOTICE 'Migration 004_kernel_log already applied — skipping.';
    RETURN;
  END IF;
END $$;

-- ─── ghostbrain_kernel_log ─────────────────────────────────────────────────
-- Records every command dispatched through the kernel command bus.
-- Write rate: low-to-medium (one row per autonomous action, typically < 1/s).

CREATE TABLE IF NOT EXISTS ghostbrain_kernel_log (
  id             UUID           NOT NULL DEFAULT gen_random_uuid(),
  executed_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  command_type   TEXT           NOT NULL,   -- docker | vm | system | resource
  action         TEXT           NOT NULL,   -- restart | stop | drop_caches | …
  target         TEXT,                      -- container name, VM name, or NULL
  result_ok      BOOLEAN        NOT NULL,
  detail         TEXT,                      -- HTTP status, error message, dry-run note
  dry_run        BOOLEAN        NOT NULL DEFAULT false,
  requested_by   TEXT           NOT NULL,   -- resource_controller | hypercore | api | …
  duration_ms    INTEGER        NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_kernel_log_executed   ON ghostbrain_kernel_log (executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_kernel_log_target     ON ghostbrain_kernel_log (target, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_kernel_log_result     ON ghostbrain_kernel_log (result_ok, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_kernel_log_type       ON ghostbrain_kernel_log (command_type, action);

COMMENT ON TABLE  ghostbrain_kernel_log IS 'Tamper-evident audit log for all GhostBrain Kernel (Layer 6) infrastructure commands';
COMMENT ON COLUMN ghostbrain_kernel_log.command_type IS 'Subsystem: docker | vm | system | resource';
COMMENT ON COLUMN ghostbrain_kernel_log.dry_run IS 'When true the command was simulated; no infrastructure was modified';
COMMENT ON COLUMN ghostbrain_kernel_log.requested_by IS 'Originating component (resource_controller, hypercore, cognitive, api)';

-- ─── Mark migration applied ────────────────────────────────────────────────
INSERT INTO schema_migrations (version, applied_at)
VALUES ('004_kernel_log', now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
