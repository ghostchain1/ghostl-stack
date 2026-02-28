CREATE TABLE IF NOT EXISTS revenue_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_layer TEXT NOT NULL,
  source_chain_id INTEGER NOT NULL,
  target_layer TEXT NOT NULL,
  target_chain_id INTEGER NOT NULL,
  fee_type TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  asset TEXT NOT NULL,
  authenticity TEXT NOT NULL,
  fraud_flag TEXT,
  payload_json TEXT NOT NULL,
  forwarded_at TEXT,
  batch_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_pending
  ON revenue_events (forwarded_at, created_at);

CREATE TABLE IF NOT EXISTS revenue_batches (
  batch_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  gross_wei TEXT NOT NULL,
  net_wei TEXT NOT NULL,
  destination_chain_id INTEGER NOT NULL,
  forward_status TEXT NOT NULL,
  forward_http_status INTEGER,
  forward_error TEXT,
  payload_json TEXT NOT NULL
);
