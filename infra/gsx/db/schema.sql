-- GhostChain Sovereign Exchange (GSX) — PostgreSQL Schema
-- Database: gsx
-- Compatible with PostgreSQL 15+

BEGIN;

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for full-text search on names

-- ── Enumerations ────────────────────────────────────────────────────────────

CREATE TYPE institution_class AS ENUM (
    'GOVERNMENT', 'CENTRAL_BANK', 'SOVEREIGN_FUND',
    'INTELLIGENCE_AGENCY', 'MULTILATERAL', 'COMMERCIAL_BANK', 'CONTRACTOR'
);

CREATE TYPE compliance_status AS ENUM (
    'PENDING', 'APPROVED', 'REJECTED', 'WATCHLIST', 'SANCTIONED'
);

CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type AS ENUM ('LIMIT', 'MARKET', 'IOC', 'FOK', 'BLOCK_TRADE', 'RFQ');
CREATE TYPE order_status AS ENUM (
    'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'
);
CREATE TYPE reserve_category AS ENUM (
    'GOLD', 'OIL', 'GAS', 'WHEAT', 'LITHIUM', 'FOREX', 'BONDS',
    'ENERGY', 'CARBON', 'INFRA', 'LAND', 'WATER', 'URANIUM'
);
CREATE TYPE risk_level AS ENUM ('NORMAL', 'ELEVATED', 'HIGH', 'CRITICAL', 'CRISIS');
CREATE TYPE settlement_status AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- ── Institutions ─────────────────────────────────────────────────────────────

CREATE TABLE institutions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gns_name            TEXT UNIQUE NOT NULL,                 -- e.g. "gov.us.treasury"
    legal_name          TEXT NOT NULL,
    institution_class   institution_class NOT NULL,
    wallet_address      CHAR(42) UNIQUE NOT NULL,             -- 0x... EVM address
    jurisdiction        CHAR(2),                              -- ISO-3166-1 alpha-2
    compliance_status   compliance_status NOT NULL DEFAULT 'PENDING',
    kyc_expiry          TIMESTAMPTZ,
    aml_cleared         BOOLEAN NOT NULL DEFAULT FALSE,
    risk_score          SMALLINT CHECK (risk_score BETWEEN 0 AND 100),
    sanctioned_at       TIMESTAMPTZ,
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institutions_wallet ON institutions (wallet_address);
CREATE INDEX idx_institutions_class  ON institutions (institution_class);
CREATE INDEX idx_institutions_status ON institutions (compliance_status);

-- ── Markets ───────────────────────────────────────────────────────────────────

CREATE TABLE markets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id       CHAR(66) UNIQUE NOT NULL,    -- keccak256 of (base, quote)
    base_asset      VARCHAR(20) NOT NULL,         -- e.g. "GOLD", "OIL", "BONDS"
    quote_asset     VARCHAR(20) NOT NULL,          -- e.g. "USD", "EUR"
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    total_volume    NUMERIC(30, 8) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_markets_assets ON markets (base_asset, quote_asset);

-- ── Orders ────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_order_id TEXT,
    institution_id  UUID NOT NULL REFERENCES institutions(id),
    market_id       UUID NOT NULL REFERENCES markets(id),
    side            order_side NOT NULL,
    order_type      order_type NOT NULL,
    price           NUMERIC(30, 8),               -- NULL for market orders
    quantity        NUMERIC(30, 8) NOT NULL,
    remaining       NUMERIC(30, 8) NOT NULL,
    status          order_status NOT NULL DEFAULT 'OPEN',
    compliance_token TEXT,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_orders_institution ON orders (institution_id);
CREATE INDEX idx_orders_market      ON orders (market_id);
CREATE INDEX idx_orders_status      ON orders (status) WHERE status IN ('OPEN', 'PARTIALLY_FILLED');
CREATE INDEX idx_orders_submitted   ON orders (submitted_at DESC);

-- ── Trades ────────────────────────────────────────────────────────────────────

CREATE TABLE trades (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id       UUID NOT NULL REFERENCES markets(id),
    buyer_order_id  UUID NOT NULL REFERENCES orders(id),
    seller_order_id UUID NOT NULL REFERENCES orders(id),
    buyer_id        UUID NOT NULL REFERENCES institutions(id),
    seller_id       UUID NOT NULL REFERENCES institutions(id),
    price           NUMERIC(30, 8) NOT NULL,
    quantity        NUMERIC(30, 8) NOT NULL,
    notional_usd    NUMERIC(30, 8) NOT NULL,
    settled         BOOLEAN NOT NULL DEFAULT FALSE,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at      TIMESTAMPTZ
);

CREATE INDEX idx_trades_market      ON trades (market_id);
CREATE INDEX idx_trades_buyer       ON trades (buyer_id);
CREATE INDEX idx_trades_seller      ON trades (seller_id);
CREATE INDEX idx_trades_executed_at ON trades (executed_at DESC);
CREATE INDEX idx_trades_unsettled   ON trades (settled) WHERE settled = FALSE;

-- ── Settlement Batches ────────────────────────────────────────────────────────

CREATE TABLE settlement_batches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_seq       BIGSERIAL UNIQUE NOT NULL,
    merkle_root     CHAR(66) NOT NULL,         -- 0x + 64 hex chars
    trade_count     INTEGER NOT NULL,
    total_value     NUMERIC(30, 8) NOT NULL,
    submitter       CHAR(42),                  -- wallet address of submitter
    tx_hash         CHAR(66),                  -- on-chain transaction hash
    status          settlement_status NOT NULL DEFAULT 'PENDING',
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ
);

CREATE INDEX idx_batches_status ON settlement_batches (status);
CREATE INDEX idx_batches_seq    ON settlement_batches (batch_seq DESC);

-- Batch→Trade mapping
CREATE TABLE batch_trades (
    batch_id   UUID NOT NULL REFERENCES settlement_batches(id) ON DELETE CASCADE,
    trade_id   UUID NOT NULL REFERENCES trades(id),
    PRIMARY KEY (batch_id, trade_id)
);

-- ── Strategic Reserves ────────────────────────────────────────────────────────

CREATE TABLE strategic_reserves (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reserve_code    TEXT UNIQUE NOT NULL,          -- e.g. "RES-GOLD-US-001"
    name            TEXT NOT NULL,
    category        reserve_category NOT NULL,
    issuer_id       UUID REFERENCES institutions(id),
    quantity        NUMERIC(30, 8) NOT NULL,
    unit            VARCHAR(30) NOT NULL,           -- "troy_oz", "barrel", "tonne"
    location        TEXT,
    active          BOOLEAN NOT NULL DEFAULT FALSE,
    approval_count  SMALLINT NOT NULL DEFAULT 0,
    valuation_usd   NUMERIC(30, 2),
    last_audited_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at    TIMESTAMPTZ
);

CREATE INDEX idx_reserves_category ON strategic_reserves (category);
CREATE INDEX idx_reserves_active   ON strategic_reserves (active) WHERE active = TRUE;

-- Reserve approvals tracking
CREATE TABLE reserve_approvals (
    reserve_id    UUID NOT NULL REFERENCES strategic_reserves(id) ON DELETE CASCADE,
    validator     CHAR(42) NOT NULL,
    approved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reserve_id, validator)
);

-- ── Reserve Audit Attestations ────────────────────────────────────────────────

CREATE TABLE reserve_audits (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reserve_id          UUID NOT NULL REFERENCES strategic_reserves(id),
    auditor             TEXT NOT NULL,
    methodology         TEXT NOT NULL,
    quantity_verified   NUMERIC(30, 8) NOT NULL,
    valuation_usd       NUMERIC(30, 2),
    evidence_hash       TEXT,             -- IPFS CID or SHA-256 of physical evidence docs
    attestation         CHAR(64) NOT NULL,
    notes               TEXT,
    audited_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audits_reserve ON reserve_audits (reserve_id);
CREATE INDEX idx_audits_date    ON reserve_audits (audited_at DESC);

-- ── Tokenized Reserve Assets ──────────────────────────────────────────────────

CREATE TABLE reserve_tokens (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id            TEXT UNIQUE NOT NULL,       -- e.g. "SRT-GOLD-A4F2"
    reserve_id          UUID NOT NULL REFERENCES strategic_reserves(id),
    symbol              VARCHAR(30) NOT NULL,
    quantity            NUMERIC(30, 8) NOT NULL,
    issuer_id           UUID REFERENCES institutions(id),
    contract_address    CHAR(42),
    valuation_usd       NUMERIC(30, 2),
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, REDEEMED, REVOKED
    tokenized_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sovereign Bonds ───────────────────────────────────────────────────────────

CREATE TABLE sovereign_bonds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bond_id         CHAR(66) UNIQUE NOT NULL,  -- on-chain keccak256
    identifier      VARCHAR(20) NOT NULL,       -- "US10Y", "EU10Y", "JGB10Y"
    issuer_id       UUID NOT NULL REFERENCES institutions(id),
    face_value      NUMERIC(30, 8) NOT NULL,
    coupon_bps      INTEGER NOT NULL,
    maturity_date   TIMESTAMPTZ NOT NULL,
    total_issued    NUMERIC(30, 8) NOT NULL,
    outstanding     NUMERIC(30, 8) NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bonds_issuer     ON sovereign_bonds (issuer_id);
CREATE INDEX idx_bonds_identifier ON sovereign_bonds (identifier);
CREATE INDEX idx_bonds_maturity   ON sovereign_bonds (maturity_date);

CREATE TABLE bond_holdings (
    bond_id       UUID NOT NULL REFERENCES sovereign_bonds(id),
    holder_id     UUID NOT NULL REFERENCES institutions(id),
    quantity      NUMERIC(30, 8) NOT NULL,
    acquired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bond_id, holder_id)
);

-- ── CBDC Accounts ─────────────────────────────────────────────────────────────

CREATE TABLE cbdc_currencies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol          VARCHAR(20) UNIQUE NOT NULL,  -- "USD-CBDC", "EUR-CBDC"
    name            TEXT NOT NULL,
    total_supply    NUMERIC(38, 18) NOT NULL DEFAULT 0,
    tx_limit        NUMERIC(38, 18) NOT NULL DEFAULT 0,
    holding_limit   NUMERIC(38, 18) NOT NULL DEFAULT 0,
    interest_bps    INTEGER NOT NULL DEFAULT 0,
    frozen_globally BOOLEAN NOT NULL DEFAULT FALSE,
    central_bank_id UUID REFERENCES institutions(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cbdc_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency_id     UUID NOT NULL REFERENCES cbdc_currencies(id),
    wallet_address  CHAR(42) NOT NULL,
    institution_id  UUID REFERENCES institutions(id),
    balance         NUMERIC(38, 18) NOT NULL DEFAULT 0,
    frozen          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (currency_id, wallet_address)
);

CREATE INDEX idx_cbdc_accounts_wallet ON cbdc_accounts (wallet_address);
CREATE INDEX idx_cbdc_accounts_frozen ON cbdc_accounts (frozen) WHERE frozen = TRUE;

-- ── Cross-Border Settlements (GSN) ────────────────────────────────────────────

CREATE TABLE gsn_settlements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    settlement_id       TEXT UNIQUE NOT NULL,
    from_institution    UUID REFERENCES institutions(id),
    to_institution      UUID REFERENCES institutions(id),
    currency            VARCHAR(10) NOT NULL,
    amount              NUMERIC(30, 8) NOT NULL,
    target_currency     VARCHAR(10),
    converted_amount    NUMERIC(30, 8),
    fx_rate             NUMERIC(20, 10),
    purpose             TEXT,
    gateway_id          TEXT,
    tx_hash             CHAR(66),
    status              TEXT NOT NULL DEFAULT 'COMPLETED',
    settled_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gsn_from ON gsn_settlements (from_institution);
CREATE INDEX idx_gsn_to   ON gsn_settlements (to_institution);
CREATE INDEX idx_gsn_date ON gsn_settlements (settled_at DESC);

-- ── Monetary Policy Log (GCM) ─────────────────────────────────────────────────

CREATE TABLE monetary_policy_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency            VARCHAR(10) NOT NULL,
    interest_rate_bps   INTEGER,
    reserve_ratio_bps   INTEGER,
    liquidity_cap       NUMERIC(30, 8),
    velocity_limit      NUMERIC(30, 8),
    changed_by          UUID REFERENCES institutions(id),
    reason              TEXT,
    effective_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_log_currency ON monetary_policy_log (currency);
CREATE INDEX idx_policy_log_date     ON monetary_policy_log (effective_at DESC);

-- ── Global Policy Directives (GWF) ────────────────────────────────────────────

CREATE TABLE policy_directives (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_type     VARCHAR(30) NOT NULL,  -- TRADE_SANCTIONS, CAPITAL_CONTROLS, etc.
    title           TEXT NOT NULL,
    description     TEXT,
    issuer_id       UUID REFERENCES institutions(id),
    scope           VARCHAR(30) NOT NULL DEFAULT 'GLOBAL',
    effective_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES institutions(id),
    directives      JSONB,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_directives_type    ON policy_directives (policy_type);
CREATE INDEX idx_directives_active  ON policy_directives (revoked_at) WHERE revoked_at IS NULL;

-- ── Custody Records ───────────────────────────────────────────────────────────

CREATE TABLE custody_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id  UUID NOT NULL REFERENCES institutions(id),
    token           VARCHAR(42) NOT NULL,     -- contract address or symbol
    balance         NUMERIC(38, 18) NOT NULL DEFAULT 0,
    reserved        NUMERIC(38, 18) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (institution_id, token)
);

CREATE TABLE custody_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      TEXT UNIQUE NOT NULL,
    institution_id  UUID NOT NULL REFERENCES institutions(id),
    token           VARCHAR(42) NOT NULL,
    amount          NUMERIC(38, 18) NOT NULL,
    recipient       CHAR(42) NOT NULL,
    approvals       TEXT[] NOT NULL DEFAULT '{}',
    required        SMALLINT NOT NULL DEFAULT 3,
    executed        BOOLEAN NOT NULL DEFAULT FALSE,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at     TIMESTAMPTZ,
    tx_hash         CHAR(66)
);

-- ── Crisis Events (GWF) ────────────────────────────────────────────────────────

CREATE TABLE crisis_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crisis_type     TEXT NOT NULL,
    description     TEXT,
    affected_markets TEXT[],
    coordinator     TEXT,
    declared_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- ── Compliance Audit Log ──────────────────────────────────────────────────────

CREATE TABLE compliance_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id  UUID REFERENCES institutions(id),
    event_type      TEXT NOT NULL,
    officer         TEXT,
    details         JSONB,
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_log_inst ON compliance_logs (institution_id);
CREATE INDEX idx_compliance_log_type ON compliance_logs (event_type);
CREATE INDEX idx_compliance_log_date ON compliance_logs (logged_at DESC);

-- ── General Audit Log ─────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    event_type      TEXT NOT NULL,
    institution     TEXT,
    data            JSONB,
    prev_hash       CHAR(64) NOT NULL,
    hash            CHAR(64) NOT NULL,
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_event    ON audit_logs (event_type);
CREATE INDEX idx_audit_logs_date     ON audit_logs (logged_at DESC);
CREATE INDEX idx_audit_logs_inst     ON audit_logs (institution);

-- ── Liquidity Pools (GSN) ─────────────────────────────────────────────────────

CREATE TABLE liquidity_pools (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency        VARCHAR(10) UNIQUE NOT NULL,
    balance         NUMERIC(30, 8) NOT NULL DEFAULT 0,
    reserved        NUMERIC(30, 8) NOT NULL DEFAULT 0,
    utilization_pct NUMERIC(6, 4) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed known pools
INSERT INTO liquidity_pools (currency, balance) VALUES
  ('USD', 10000000000),
  ('EUR', 8000000000),
  ('JPY', 1200000000000),
  ('GBP', 5000000000),
  ('CNY', 50000000000);

-- ── Price Feeds (GSR Oracle) ───────────────────────────────────────────────────

CREATE TABLE price_feeds (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset           VARCHAR(20) NOT NULL,
    price           NUMERIC(30, 8) NOT NULL,
    unit            VARCHAR(30) NOT NULL,
    reporter        TEXT,
    source          TEXT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_feeds_asset ON price_feeds (asset);
CREATE INDEX idx_price_feeds_date  ON price_feeds (recorded_at DESC);

-- Seed initial commodity prices
INSERT INTO price_feeds (asset, price, unit, reporter) VALUES
  ('GOLD',      2034.50, 'troy_oz',   'genesis'),
  ('OIL',         77.20, 'barrel',    'genesis'),
  ('GAS',          2.18, 'mmbtu',     'genesis'),
  ('WHEAT',        5.40, 'bushel',    'genesis'),
  ('LITHIUM',  14000.00, 'tonne',     'genesis'),
  ('CARBON',      65.00, 'tonne_co2', 'genesis'),
  ('SILVER',      23.45, 'troy_oz',   'genesis'),
  ('COPPER',       3.85, 'lb',        'genesis');

COMMIT;
