CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  incident_id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  env TEXT NOT NULL CHECK(env IN ('devnet','testnet','mainnet')),
  scope TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('P0','P1','P2','P3','P4')),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','mitigated','resolved','false_positive')),
  symptoms_json TEXT NOT NULL,
  hypotheses_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  evidence_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  sha256 TEXT,
  created_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  proposal_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  created_ts INTEGER NOT NULL,
  constraints_json TEXT NOT NULL,
  signatures_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','attested','submitted','executed','rejected'))
);

CREATE TABLE IF NOT EXISTS fixes (
  fix_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  description TEXT NOT NULL,
  diff_summary TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  blast_radius TEXT NOT NULL CHECK(blast_radius IN ('low','med','high')),
  uncertainty INTEGER NOT NULL,
  expected_benefit INTEGER NOT NULL,
  rollback_plan_json TEXT NOT NULL,
  verification_steps_json TEXT NOT NULL,
  required_gates TEXT NOT NULL,
  score INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  fix_id TEXT NOT NULL REFERENCES fixes(fix_id) ON DELETE CASCADE,
  started_ts INTEGER NOT NULL,
  finished_ts INTEGER,
  outcome TEXT NOT NULL CHECK(outcome IN ('running','success','failed','rolled_back','blocked')),
  logs_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_state_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  env TEXT NOT NULL,
  state_json TEXT NOT NULL
);

