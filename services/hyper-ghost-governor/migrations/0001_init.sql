CREATE TABLE IF NOT EXISTS proposals (
  proposal_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  treasury_snapshot_json TEXT NOT NULL,
  input_json TEXT NOT NULL,
  summary_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ranked_strategies (
  strategy_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  rank_index INTEGER NOT NULL,
  score REAL NOT NULL,
  expected_apy_min_bps INTEGER NOT NULL,
  expected_apy_max_bps INTEGER NOT NULL,
  worst_drawdown_bps INTEGER NOT NULL,
  risk_score_bps INTEGER NOT NULL,
  concentration_bps INTEGER NOT NULL,
  reason_codes_json TEXT NOT NULL,
  policy_violations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (proposal_id, strategy_id)
);

CREATE TABLE IF NOT EXISTS evidence_packs (
  proposal_id TEXT PRIMARY KEY,
  bundle_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  files_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ranked_strategies_rank
  ON ranked_strategies (proposal_id, rank_index ASC);
