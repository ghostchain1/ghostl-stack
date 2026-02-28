CREATE TABLE IF NOT EXISTS treasury_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS safety_flags (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  emergency_halt INTEGER NOT NULL DEFAULT 0,
  allocation_paused INTEGER NOT NULL DEFAULT 0,
  withdrawal_freeze INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO safety_flags (
  id,
  emergency_halt,
  allocation_paused,
  withdrawal_freeze,
  updated_at
) VALUES (1, 0, 0, 0, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS revenue_batches (
  batch_id TEXT PRIMARY KEY,
  source_layer TEXT NOT NULL,
  source_chain_id INTEGER NOT NULL,
  target_layer TEXT NOT NULL,
  target_chain_id INTEGER NOT NULL,
  gross_wei TEXT NOT NULL,
  net_wei TEXT NOT NULL,
  ops_fee_wei TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allocations (
  allocation_id TEXT PRIMARY KEY,
  governance_proposal_id TEXT NOT NULL,
  deployed_amount_wei TEXT NOT NULL,
  expected_apy_bps INTEGER NOT NULL,
  risk_score_bps INTEGER NOT NULL,
  destination_type TEXT NOT NULL,
  destination_chain_id INTEGER NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  executed_at TEXT,
  metadata_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allocation_routes (
  route_id TEXT PRIMARY KEY,
  allocation_id TEXT NOT NULL,
  adapter_id TEXT,
  deployed_amount_wei TEXT NOT NULL,
  expected_apy_bps INTEGER NOT NULL,
  risk_score_bps INTEGER NOT NULL,
  route_status TEXT NOT NULL,
  route_error TEXT,
  routed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS yield_returns (
  return_id TEXT PRIMARY KEY,
  allocation_id TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  observed_apy_bps INTEGER,
  source TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allocations_created_at
  ON allocations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yield_returns_recorded_at
  ON yield_returns (recorded_at DESC);

CREATE TABLE IF NOT EXISTS member_exposure (
  member_id TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  exposure_wei TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS solvency_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  epoch INTEGER NOT NULL UNIQUE,
  assets_root TEXT NOT NULL,
  liabilities_root TEXT NOT NULL,
  net_position_root TEXT NOT NULL,
  assets_total_wei TEXT NOT NULL,
  liabilities_total_wei TEXT NOT NULL,
  solvent INTEGER NOT NULL,
  artifact_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_solvency_snapshots_no_update
BEFORE UPDATE ON solvency_snapshots
BEGIN
  SELECT RAISE(ABORT, 'solvency_snapshots_append_only');
END;

CREATE TRIGGER IF NOT EXISTS trg_solvency_snapshots_no_delete
BEFORE DELETE ON solvency_snapshots
BEGIN
  SELECT RAISE(ABORT, 'solvency_snapshots_append_only');
END;
