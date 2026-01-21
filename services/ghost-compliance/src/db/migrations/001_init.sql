CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS laws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code TEXT NOT NULL REFERENCES jurisdictions(code),
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS law_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_id UUID NOT NULL REFERENCES laws(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'staged', 'active')),
  yaml TEXT NOT NULL,
  bundle JSONB NOT NULL,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  staged_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES policy_bundles(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  priority INT NOT NULL,
  actions TEXT[] NOT NULL,
  effect TEXT NOT NULL,
  effect_detail JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  user_id TEXT,
  residency_country TEXT,
  kyc_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES compliance_subjects(id) ON DELETE CASCADE,
  decision_id UUID,
  prev_hash TEXT,
  hash TEXT NOT NULL,
  artifacts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT UNIQUE NOT NULL,
  subject_id UUID NOT NULL REFERENCES compliance_subjects(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource JSONB,
  context JSONB,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'allow_with_controls')),
  reasons TEXT[] NOT NULL,
  required_controls TEXT[] NOT NULL,
  disclosures TEXT[] NOT NULL,
  matched_rules JSONB NOT NULL,
  policy_bundle_id UUID REFERENCES policy_bundles(id),
  evidence_bundle_id UUID REFERENCES evidence_bundles(id),
  attestation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction TEXT NOT NULL,
  topic TEXT NOT NULL,
  risk_delta NUMERIC NOT NULL,
  summary TEXT NOT NULL,
  features JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laws_jur_topic ON laws(jurisdiction_code, topic);
CREATE INDEX IF NOT EXISTS idx_decisions_subject_time ON compliance_decisions(subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_jur_topic ON compliance_predictions(jurisdiction, topic);
