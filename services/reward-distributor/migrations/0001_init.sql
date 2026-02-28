CREATE TABLE IF NOT EXISTS reward_cycles (
  cycle_id TEXT PRIMARY KEY,
  governance_proposal_id TEXT NOT NULL,
  net_yield_wei TEXT NOT NULL,
  operational_reserve_wei TEXT NOT NULL,
  validator_rewards_wei TEXT NOT NULL,
  ecosystem_incentives_wei TEXT NOT NULL,
  l2l3_incentive_wei TEXT NOT NULL,
  execute_after TEXT NOT NULL,
  created_at TEXT NOT NULL,
  executed_at TEXT,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS distributor_flags (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  emergency_halt INTEGER NOT NULL DEFAULT 0,
  distribution_paused INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO distributor_flags (id, emergency_halt, distribution_paused, updated_at)
VALUES (1, 0, 0, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_reward_cycles_status
  ON reward_cycles (status, execute_after);
