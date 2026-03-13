-- GSI master schema (PostgreSQL + TimescaleDB)

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Identity types
CREATE TYPE identity_type AS ENUM (
  'GOVERNMENT', 'CENTRAL_BANK', 'INSTITUTION',
  'CORPORATION', 'CITIZEN', 'DEVICE', 'AI_AGENT'
);

CREATE TYPE institution_type AS ENUM (
  'GOVERNMENT', 'CENTRAL_BANK', 'SOVEREIGN_FUND',
  'TIER1_BANK', 'DEFENCE_CONTRACTOR', 'INTELLIGENCE_AGENCY',
  'REGULATOR', 'AUDITOR'
);

-- Identities
CREATE TABLE IF NOT EXISTS identities (
  wallet          CHAR(42)        PRIMARY KEY,
  name            TEXT            NOT NULL UNIQUE,
  id_type         identity_type   NOT NULL,
  verified        BOOLEAN         NOT NULL DEFAULT FALSE,
  active          BOOLEAN         NOT NULL DEFAULT TRUE,
  verified_by     CHAR(42),
  registered_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  verified_at     TIMESTAMPTZ
);
CREATE INDEX ON identities (name);
CREATE INDEX ON identities (id_type, verified);

-- Credentials
CREATE TABLE IF NOT EXISTS credentials (
  id              BIGSERIAL       PRIMARY KEY,
  credential_type TEXT            NOT NULL,
  subject         CHAR(42)        NOT NULL REFERENCES identities(wallet),
  issuer          CHAR(42)        NOT NULL,
  issued_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  revoked         BOOLEAN         NOT NULL DEFAULT FALSE,
  revoked_at      TIMESTAMPTZ,
  revoke_reason   TEXT,
  proof_hash      CHAR(66)        NOT NULL,
  tx_hash         CHAR(66)
);
CREATE INDEX ON credentials (subject, revoked);
CREATE INDEX ON credentials (credential_type, revoked);

-- Institutions
CREATE TABLE IF NOT EXISTS institutions (
  wallet          CHAR(42)        PRIMARY KEY,
  name            TEXT            NOT NULL UNIQUE,
  legal_name      TEXT            NOT NULL,
  inst_type       institution_type NOT NULL,
  jurisdiction    CHAR(3),        -- ISO-3166-1 alpha-3
  approved        BOOLEAN         NOT NULL DEFAULT FALSE,
  suspended       BOOLEAN         NOT NULL DEFAULT FALSE,
  approved_by     CHAR(42),
  registered_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);
CREATE INDEX ON institutions (inst_type, approved);

-- Passports (soul-bound digital identity tokens)
CREATE TABLE IF NOT EXISTS passports (
  token_id        BIGSERIAL       PRIMARY KEY,
  holder          CHAR(42)        NOT NULL UNIQUE,
  country_iso     CHAR(3)         NOT NULL,
  -- commitment = keccak256(biometric_proof || doc_hash) — no raw PII stored
  identity_commitment CHAR(66)    NOT NULL UNIQUE,
  issued_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ     NOT NULL,
  revoked         BOOLEAN         NOT NULL DEFAULT FALSE,
  revoked_at      TIMESTAMPTZ,
  revoke_reason   TEXT,
  issued_by       CHAR(42)        NOT NULL
);
CREATE INDEX ON passports (holder, revoked);
CREATE INDEX ON passports (country_iso);

-- Verification audit log (hypertable)
CREATE TABLE IF NOT EXISTS verification_log (
  id              BIGSERIAL       NOT NULL,
  subject         CHAR(42)        NOT NULL,
  verifier        CHAR(42)        NOT NULL,
  action          TEXT            NOT NULL,  -- VERIFY | REVOKE | SUSPEND
  result          TEXT            NOT NULL,  -- PASS | FAIL | PENDING
  details         JSONB,
  logged_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  tx_hash         CHAR(66),
  PRIMARY KEY (id, logged_at)
);
SELECT create_hypertable('verification_log', 'logged_at', if_not_exists => TRUE);
CREATE INDEX ON verification_log (subject, logged_at DESC);

-- Fraud alerts (from gsi-ai)
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id              BIGSERIAL       PRIMARY KEY,
  subject         CHAR(42),
  alert_type      TEXT            NOT NULL,
  severity        TEXT            NOT NULL DEFAULT 'medium',
  message         TEXT            NOT NULL,
  data            JSONB,
  resolved        BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX ON fraud_alerts (subject, resolved);
CREATE INDEX ON fraud_alerts (severity, resolved);
