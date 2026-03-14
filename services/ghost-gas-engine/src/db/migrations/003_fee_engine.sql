ALTER TABLE gas_chains
  ADD COLUMN IF NOT EXISTS gas_token_address TEXT,
  ADD COLUMN IF NOT EXISTS gas_token_name TEXT,
  ADD COLUMN IF NOT EXISTS gas_token_decimals INTEGER;

UPDATE gas_chains
SET gas_token_address = COALESCE(gas_token_address, '0x5FbDB2315678afecb367f032d93F642f64180aa3'),
    gas_token_name = COALESCE(gas_token_name, 'Ghost Token'),
    gas_token_decimals = COALESCE(gas_token_decimals, 18);

CREATE TABLE IF NOT EXISTS gas_fee_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL UNIQUE REFERENCES gas_chains(chain_key) ON DELETE CASCADE,
  max_base_fee NUMERIC NOT NULL,
  max_priority_fee NUMERIC NOT NULL,
  spike_threshold_bps INTEGER NOT NULL,
  window_seconds INTEGER NOT NULL,
  violation_penalty_bps INTEGER NOT NULL,
  min_bond NUMERIC NOT NULL,
  auto_exec_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_fee_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL REFERENCES gas_chains(chain_key) ON DELETE CASCADE,
  block_number BIGINT,
  base_fee NUMERIC,
  priority_fee NUMERIC,
  gas_used_ratio NUMERIC,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'rpc',
  raw JSONB
);

CREATE TABLE IF NOT EXISTS gas_fee_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL REFERENCES gas_chains(chain_key) ON DELETE CASCADE,
  recommended_base_fee NUMERIC NOT NULL,
  recommended_priority_fee NUMERIC NOT NULL,
  volatility_score NUMERIC NOT NULL,
  anomaly_score NUMERIC NOT NULL,
  drivers JSONB,
  policy_bounds JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_slashing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL REFERENCES gas_chains(chain_key) ON DELETE CASCADE,
  operator TEXT,
  violation_id BIGINT,
  reason_code INTEGER,
  slash_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'reported',
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gas_fee_samples_chain_time
  ON gas_fee_samples(chain_key, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_gas_fee_recommendations_chain_time
  ON gas_fee_recommendations(chain_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gas_fee_policy_chain
  ON gas_fee_policy(chain_key);

CREATE INDEX IF NOT EXISTS idx_gas_slashing_events_chain_time
  ON gas_slashing_events(chain_key, created_at DESC);
