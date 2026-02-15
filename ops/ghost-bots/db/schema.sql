PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  root_cause TEXT,
  subsystem TEXT,
  chain_layer TEXT,
  service TEXT,
  fingerprint TEXT NOT NULL UNIQUE,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_last_seen ON incidents(last_seen);

CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signals_incident_id ON signals(incident_id);

CREATE TABLE IF NOT EXISTS patches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  rank_score INTEGER NOT NULL,
  patch_type TEXT NOT NULL,
  files_json TEXT NOT NULL,
  diff_stat_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  risk TEXT NOT NULL,
  rollback TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patches_incident_id ON patches(incident_id);

CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patch_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  ok INTEGER NOT NULL,
  output_path TEXT,
  FOREIGN KEY(patch_id) REFERENCES patches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verifications_patch_id ON verifications(patch_id);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patch_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  approver TEXT NOT NULL,
  decision TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY(patch_id) REFERENCES patches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approvals_patch_id ON approvals(patch_id);

CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patch_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  method TEXT NOT NULL,
  ok INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY(patch_id) REFERENCES patches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deployments_patch_id ON deployments(patch_id);
