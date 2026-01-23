CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pil_chains (
  chain_id BIGINT PRIMARY KEY,
  chain_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('L1', 'L2', 'L3')),
  gas_token_symbol TEXT NOT NULL,
  rpc_url_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_chain_state (
  chain_id BIGINT PRIMARY KEY REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  last_block_number BIGINT,
  last_block_hash TEXT,
  last_ingested_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_blocks (
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  number BIGINT NOT NULL,
  hash TEXT NOT NULL,
  parent_hash TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  gas_limit NUMERIC,
  gas_used NUMERIC,
  tx_count INTEGER,
  PRIMARY KEY (chain_id, number)
);

CREATE INDEX IF NOT EXISTS idx_pil_blocks_chain_time ON pil_blocks(chain_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS pil_txs (
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  block_number BIGINT,
  from_addr TEXT,
  to_addr TEXT,
  nonce NUMERIC,
  gas_limit NUMERIC,
  gas_price NUMERIC,
  max_fee_per_gas NUMERIC,
  max_priority_fee_per_gas NUMERIC,
  value NUMERIC,
  input_size INTEGER,
  status TEXT,
  PRIMARY KEY (chain_id, hash)
);

CREATE INDEX IF NOT EXISTS idx_pil_txs_chain_block ON pil_txs(chain_id, block_number);

CREATE TABLE IF NOT EXISTS pil_receipts (
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  tx_hash TEXT NOT NULL,
  status INTEGER,
  gas_used NUMERIC,
  cumulative_gas_used NUMERIC,
  effective_gas_price NUMERIC,
  contract_address TEXT,
  logs_bloom TEXT,
  PRIMARY KEY (chain_id, tx_hash)
);

CREATE TABLE IF NOT EXISTS pil_traces (
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  tx_hash TEXT NOT NULL,
  trace_available BOOLEAN NOT NULL DEFAULT FALSE,
  trace_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, tx_hash)
);

CREATE TABLE IF NOT EXISTS pil_rpc_health (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  latency_ms INTEGER,
  error_rate NUMERIC,
  last_ok_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_pil_rpc_health_chain_ok ON pil_rpc_health(chain_id, last_ok_at DESC);

CREATE TABLE IF NOT EXISTS pil_jurisdictions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('LOW', 'MEDIUM', 'HIGH', 'EXTREME')),
  regulatory_profile JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_legal_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code TEXT NOT NULL REFERENCES pil_jurisdictions(code),
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  source_refs JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pil_legal_signals_jur_time ON pil_legal_signals(jurisdiction_code, detected_at DESC);

CREATE TABLE IF NOT EXISTS pil_regulatory_trends (
  id BIGSERIAL PRIMARY KEY,
  region TEXT NOT NULL,
  direction TEXT NOT NULL,
  risk_delta NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pil_policy_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code TEXT NOT NULL REFERENCES pil_jurisdictions(code),
  version TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  confidence_score NUMERIC NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  sunset_at TIMESTAMPTZ,
  rules JSONB NOT NULL,
  source_refs JSONB NOT NULL,
  simulation_report JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pil_policy_packs_unique ON pil_policy_packs(jurisdiction_code, version);

CREATE TABLE IF NOT EXISTS pil_compliance_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reasons TEXT[] NOT NULL,
  jurisdiction_applied TEXT NOT NULL,
  policy_pack_id UUID REFERENCES pil_policy_packs(id),
  explainability_graph JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pil_decisions_jur_time ON pil_compliance_decisions(jurisdiction_applied, created_at DESC);

CREATE TABLE IF NOT EXISTS pil_compliance_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_hash TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  proof_hash TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pil_proofs_subject ON pil_compliance_proofs(subject_hash);
CREATE INDEX IF NOT EXISTS idx_pil_proofs_jur ON pil_compliance_proofs(jurisdiction_code);

CREATE TABLE IF NOT EXISTS pil_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  correlation_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_sim_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  horizon TEXT NOT NULL,
  params_json JSONB NOT NULL,
  model_version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_sim_results (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES pil_sim_runs(id) ON DELETE CASCADE,
  throughput NUMERIC,
  predicted_fees NUMERIC,
  predicted_revert_rate NUMERIC,
  predicted_oog_rate NUMERIC,
  confidence NUMERIC,
  results_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  rationale TEXT NOT NULL,
  risks TEXT[] NOT NULL,
  confidence NUMERIC NOT NULL,
  sim_run_ids UUID[] NOT NULL,
  rollback_plan TEXT,
  required_approvals INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_approvals (
  id BIGSERIAL PRIMARY KEY,
  recommendation_id UUID NOT NULL REFERENCES pil_recommendations(id) ON DELETE CASCADE,
  approver TEXT NOT NULL,
  method TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pil_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES pil_recommendations(id) ON DELETE CASCADE,
  plan_json JSONB NOT NULL,
  status TEXT NOT NULL,
  tx_hashes TEXT[],
  rollback_tx_hashes TEXT[],
  logs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
