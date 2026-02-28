CREATE TABLE IF NOT EXISTS fee_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_type TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  asset TEXT NOT NULL,
  destination_layer TEXT NOT NULL,
  destination_chain_id INTEGER NOT NULL,
  destination_bridge_address TEXT NOT NULL,
  forward_status TEXT NOT NULL,
  forward_http_status INTEGER,
  forward_error TEXT,
  payload_json TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS fee_events_append_only_update
BEFORE UPDATE ON fee_events
BEGIN
  SELECT RAISE(ABORT, 'fee_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS fee_events_append_only_delete
BEFORE DELETE ON fee_events
BEGIN
  SELECT RAISE(ABORT, 'fee_events is append-only');
END;
