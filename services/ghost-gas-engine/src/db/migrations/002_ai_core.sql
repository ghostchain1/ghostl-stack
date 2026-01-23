CREATE TABLE IF NOT EXISTS ai_chain_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  block_number BIGINT,
  gas_limit NUMERIC,
  gas_used NUMERIC,
  base_fee NUMERIC,
  block_time TIMESTAMPTZ,
  rpc_latency_ms INTEGER,
  rpc_namespace TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_risk_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  risk_score NUMERIC NOT NULL,
  predicted_failure_probability NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  time_horizon_seconds INTEGER NOT NULL,
  affected_subsystem TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  features JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_core_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  mode TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_score NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  forecast_id UUID,
  deployment_id UUID,
  rationale JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_core_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID,
  chain_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_core_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_failure_fingerprints (
  fingerprint TEXT PRIMARY KEY,
  chain_key TEXT NOT NULL,
  classification TEXT NOT NULL,
  error_signature TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_suppression_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL REFERENCES ai_failure_fingerprints(fingerprint) ON DELETE CASCADE,
  chain_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_recovery_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_governance_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_policy_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_key TEXT NOT NULL,
  max_risk NUMERIC,
  max_gas_limit NUMERIC,
  max_retries INTEGER,
  allowed_actions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_obs_chain_time ON ai_chain_observations(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_pred_chain_time ON ai_risk_predictions(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_chain_time ON ai_core_decisions(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_chain_time ON ai_core_actions(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_chain_time ON ai_core_events(chain_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gov_chain_status ON ai_governance_recommendations(chain_key, status, created_at DESC);
