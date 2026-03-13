-- GSA master schema (PostgreSQL + TimescaleDB)

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Agent types
CREATE TYPE agent_type AS ENUM (
  'MARKET_MONITOR', 'RISK_ASSESSOR', 'POLICY_ENGINE',
  'FRAUD_DETECTOR', 'ORACLE_FEEDER', 'GOVERNANCE_AI',
  'ECONOMIC_FORECASTER', 'SYSTEM_GUARDIAN'
);

CREATE TYPE agent_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DECOMMISSIONED');

CREATE TYPE audit_category AS ENUM (
  'DECISION', 'POLICY_PROP', 'ORACLE_UPDATE',
  'ALERT_RAISED', 'GOVERNANCE', 'SYSTEM_ACTION'
);

-- AI Agents
CREATE TABLE IF NOT EXISTS ai_agents (
  agent_id          CHAR(66)       PRIMARY KEY,  -- keccak256 hex
  name              TEXT           NOT NULL UNIQUE,
  agent_type        agent_type     NOT NULL,
  operator_wallet   CHAR(42)       NOT NULL,
  model_hash        CHAR(66)       NOT NULL,
  status            agent_status   NOT NULL DEFAULT 'PENDING',
  registered_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  activated_at      TIMESTAMPTZ,
  decision_count    BIGINT         NOT NULL DEFAULT 0,
  performance_score INT            NOT NULL DEFAULT 0
);
CREATE INDEX ON ai_agents (status, agent_type);

-- Oracle feeds
CREATE TABLE IF NOT EXISTS oracle_feeds (
  feed_id      CHAR(66)      PRIMARY KEY,
  name         TEXT          NOT NULL UNIQUE,
  value        NUMERIC,
  confidence   INT           NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ,
  agent_id     CHAR(66)      REFERENCES ai_agents(agent_id),
  proof_hash   CHAR(66)
);
CREATE INDEX ON oracle_feeds (name);

-- Oracle history (hypertable)
CREATE TABLE IF NOT EXISTS oracle_history (
  id           BIGSERIAL     NOT NULL,
  feed_id      CHAR(66)      NOT NULL,
  value        NUMERIC       NOT NULL,
  confidence   INT           NOT NULL,
  agent_id     CHAR(66)      NOT NULL,
  recorded_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (id, recorded_at)
);
SELECT create_hypertable('oracle_history', 'recorded_at', if_not_exists => TRUE);
CREATE INDEX ON oracle_history (feed_id, recorded_at DESC);

-- Policy changes
CREATE TABLE IF NOT EXISTS policy_changes (
  id             BIGSERIAL    PRIMARY KEY,
  agent_id       CHAR(66)     NOT NULL,
  subsystem      TEXT         NOT NULL,
  parameter      TEXT         NOT NULL,
  current_value  NUMERIC,
  proposed_value NUMERIC      NOT NULL,
  rationale      TEXT,
  confidence     INT          NOT NULL DEFAULT 0,
  approved       BOOLEAN      NOT NULL DEFAULT FALSE,
  rejected       BOOLEAN      NOT NULL DEFAULT FALSE,
  proposed_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ
);
CREATE INDEX ON policy_changes (subsystem, approved);

-- Governance proposals
CREATE TABLE IF NOT EXISTS governance_proposals (
  id            BIGSERIAL    PRIMARY KEY,
  title         TEXT         NOT NULL,
  description   TEXT,
  proposal_type TEXT         NOT NULL,
  target_addr   CHAR(42),
  ai_agent_id   CHAR(66),
  votes_for     BIGINT       NOT NULL DEFAULT 0,
  votes_against BIGINT       NOT NULL DEFAULT 0,
  deadline      TIMESTAMPTZ  NOT NULL,
  executed      BOOLEAN      NOT NULL DEFAULT FALSE,
  vetoed        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ON governance_proposals (executed, vetoed, deadline);

-- Risk scores (hypertable)
CREATE TABLE IF NOT EXISTS risk_scores (
  id          BIGSERIAL    NOT NULL,
  subsystem   TEXT         NOT NULL,
  risk_type   TEXT         NOT NULL,
  score       INT          NOT NULL,  -- 0-10000 bps
  agent_id    CHAR(66),
  details     JSONB,
  scored_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (id, scored_at)
);
SELECT create_hypertable('risk_scores', 'scored_at', if_not_exists => TRUE);
CREATE INDEX ON risk_scores (subsystem, scored_at DESC);
CREATE INDEX ON risk_scores (risk_type, score DESC);

-- AI audit log (hypertable)
CREATE TABLE IF NOT EXISTS ai_audit (
  entry_id    BIGSERIAL    NOT NULL,
  agent_id    CHAR(66)     NOT NULL,
  category    audit_category NOT NULL,
  action      TEXT         NOT NULL,
  data_hash   CHAR(66),
  details     JSONB,
  reviewed    BOOLEAN      NOT NULL DEFAULT FALSE,
  reviewer    CHAR(42),
  logged_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  block_num   BIGINT,
  PRIMARY KEY (entry_id, logged_at)
);
SELECT create_hypertable('ai_audit', 'logged_at', if_not_exists => TRUE);
CREATE INDEX ON ai_audit (agent_id, logged_at DESC);
CREATE INDEX ON ai_audit (category, logged_at DESC);

-- System alerts (hypertable)
CREATE TABLE IF NOT EXISTS system_alerts (
  id           BIGSERIAL    NOT NULL,
  subsystem    TEXT         NOT NULL,
  alert_type   TEXT         NOT NULL,
  severity     TEXT         NOT NULL DEFAULT 'medium',
  message      TEXT         NOT NULL,
  agent_id     CHAR(66),
  data         JSONB,
  resolved     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  PRIMARY KEY (id, created_at)
);
SELECT create_hypertable('system_alerts', 'created_at', if_not_exists => TRUE);
CREATE INDEX ON system_alerts (severity, resolved);
CREATE INDEX ON system_alerts (subsystem, resolved, created_at DESC);
