CREATE TABLE IF NOT EXISTS pil_validator_scores (
  id BIGSERIAL PRIMARY KEY,
  validator_id TEXT NOT NULL,
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  jurisdiction_code TEXT NOT NULL,
  score INTEGER NOT NULL,
  policy_pack_id UUID REFERENCES pil_policy_packs(id),
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (validator_id, chain_id)
);

CREATE TABLE IF NOT EXISTS pil_validator_events (
  id BIGSERIAL PRIMARY KEY,
  validator_id TEXT NOT NULL,
  chain_id BIGINT NOT NULL REFERENCES pil_chains(chain_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pil_validator_scores_chain ON pil_validator_scores(chain_id, score DESC);
