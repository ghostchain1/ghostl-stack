CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS gas_chains (
  chain_key TEXT PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  chain_name TEXT NOT NULL,
  chain_type TEXT NOT NULL,
  rpc_url TEXT NOT NULL,
  gas_token_symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL REFERENCES gas_chains(chain_key) ON DELETE CASCADE,
  version TEXT NOT NULL,
  policy JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_key, version)
);

CREATE TABLE IF NOT EXISTS gas_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  tx_request JSONB NOT NULL,
  estimated_gas NUMERIC NOT NULL,
  recommended_gas_limit NUMERIC NOT NULL,
  block_gas_limit NUMERIC NOT NULL,
  margin_percent NUMERIC NOT NULL,
  failure_reason TEXT,
  rpc_namespace TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  name TEXT,
  mode TEXT,
  tx_request JSONB,
  raw_tx TEXT,
  foundry_path TEXT,
  foundry_index INTEGER,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_deployment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES gas_deployments(id) ON DELETE CASCADE,
  decision_id UUID,
  attempt INTEGER NOT NULL,
  tx_hash TEXT,
  nonce BIGINT,
  gas_limit NUMERIC,
  gas_price NUMERIC,
  max_fee_per_gas NUMERIC,
  max_priority_fee_per_gas NUMERIC,
  status TEXT NOT NULL,
  failure_reason TEXT,
  classification TEXT,
  gas_used NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, attempt)
);

CREATE TABLE IF NOT EXISTS gas_tx_receipts (
  tx_hash TEXT PRIMARY KEY,
  receipt JSONB NOT NULL,
  status INTEGER,
  gas_used NUMERIC,
  effective_gas_price NUMERIC,
  block_number BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_traces (
  tx_hash TEXT PRIMARY KEY,
  trace JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_autonomy_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN,
  mode TEXT,
  max_risk NUMERIC,
  max_gas_limit NUMERIC,
  max_retries INTEGER,
  policy_lock BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_autonomy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES gas_deployments(id) ON DELETE SET NULL,
  chain_key TEXT NOT NULL,
  mode TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_score NUMERIC NOT NULL,
  predicted_success NUMERIC NOT NULL,
  predicted_gas_used NUMERIC,
  selected_gas_limit NUMERIC,
  selected_max_retries INTEGER,
  rationale JSONB,
  confidence NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_autonomy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_risk_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  risk_score NUMERIC NOT NULL,
  predicted_failure_probability NUMERIC NOT NULL,
  failure_types JSONB,
  confidence NUMERIC NOT NULL,
  features JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_policy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  version TEXT NOT NULL,
  policy JSONB NOT NULL,
  applied_by TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_policy_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  base_multiplier NUMERIC NOT NULL,
  safety_margin_percent NUMERIC NOT NULL,
  retry_multiplier_step NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gas_prevented_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  failure_type TEXT NOT NULL,
  risk_score NUMERIC NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_decisions_chain ON gas_autonomy_decisions(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomy_events_chain ON gas_autonomy_events(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_forecasts_chain ON gas_risk_forecasts(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_history_chain ON gas_policy_history(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_drift_chain ON gas_policy_drift(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prevented_failures_chain ON gas_prevented_failures(chain_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gas_simulations_chain ON gas_simulations(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gas_deployments_chain ON gas_deployments(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gas_attempts_deployment ON gas_deployment_attempts(deployment_id);
