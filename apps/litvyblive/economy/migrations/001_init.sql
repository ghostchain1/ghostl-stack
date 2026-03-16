-- LitVybzLive Economy — initial schema
-- Applies to database: litvyb_economy
-- All GST amounts stored as BIGINT (satoshi-scale integer units)

BEGIN;

-- ── creator-treasury ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_treasury (
  creator_id         TEXT        PRIMARY KEY,
  balance            BIGINT      NOT NULL DEFAULT 0 CHECK (balance >= 0),
  pending_withdrawal BIGINT      NOT NULL DEFAULT 0 CHECK (pending_withdrawal >= 0)
);

CREATE TABLE IF NOT EXISTS treasury_transactions (
  id          TEXT        PRIMARY KEY,
  creator_id  TEXT        NOT NULL REFERENCES creator_treasury(creator_id),
  amount_gst  BIGINT      NOT NULL,
  type        TEXT        NOT NULL,    -- 'credit' | 'debit' | 'withdrawal'
  source      TEXT,
  ref_id      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_txns_creator
  ON treasury_transactions (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS treasury_withdrawals (
  id           TEXT        PRIMARY KEY,
  creator_id   TEXT        NOT NULL REFERENCES creator_treasury(creator_id),
  amount_gst   BIGINT      NOT NULL,
  fee_gst      BIGINT      NOT NULL DEFAULT 0,
  net_gst      BIGINT      NOT NULL,
  ghost_wallet TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_treasury_withdrawals_creator
  ON treasury_withdrawals (creator_id, created_at DESC);

-- ── fan-memberships ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fan_memberships (
  id          TEXT        PRIMARY KEY,
  fan_id      TEXT        NOT NULL,
  creator_id  TEXT        NOT NULL,
  tier        TEXT        NOT NULL,
  price_gst   BIGINT      NOT NULL,
  benefits    JSONB       NOT NULL DEFAULT '[]',
  status      TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'cancelled'
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fan_memberships_fan
  ON fan_memberships (fan_id, status);
CREATE INDEX IF NOT EXISTS idx_fan_memberships_creator
  ON fan_memberships (creator_id, status);

-- ── creator-tokens ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_tokens (
  id                 TEXT        PRIMARY KEY,
  creator_id         TEXT        NOT NULL UNIQUE,
  name               TEXT        NOT NULL,
  symbol             TEXT        NOT NULL,
  total_supply       BIGINT      NOT NULL,
  circulating_supply BIGINT      NOT NULL DEFAULT 0,
  reserve_gst        BIGINT      NOT NULL DEFAULT 0,
  market_cap_gst     BIGINT      NOT NULL DEFAULT 0,
  price_gst          BIGINT      NOT NULL DEFAULT 0, -- per token, in GST units
  description        TEXT,
  status             TEXT        NOT NULL DEFAULT 'active',
  launched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_balances (
  token_id   TEXT        NOT NULL REFERENCES creator_tokens(id),
  user_id    TEXT        NOT NULL,
  balance    BIGINT      NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (token_id, user_id)
);

CREATE TABLE IF NOT EXISTS token_trades (
  id          TEXT        PRIMARY KEY,
  token_id    TEXT        NOT NULL REFERENCES creator_tokens(id),
  user_id     TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('buy', 'sell')),
  token_amt   BIGINT      NOT NULL,
  gst_amt     BIGINT      NOT NULL,
  fee_gst     BIGINT      NOT NULL DEFAULT 0,
  price_gst   BIGINT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_trades_token
  ON token_trades (token_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_trades_user
  ON token_trades (user_id, created_at DESC);

-- ── nft-gifts ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nft_gifts (
  id          TEXT        PRIMARY KEY,
  token_id    TEXT        NOT NULL,            -- creator token used to mint
  sender_id   TEXT        NOT NULL,
  creator_id  TEXT        NOT NULL,
  stream_id   TEXT,
  gift_type   TEXT        NOT NULL,
  price_gst   BIGINT      NOT NULL,
  rarity      TEXT        NOT NULL DEFAULT 'common',
  metadata    JSONB       NOT NULL DEFAULT '{}',
  owner_id    TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'minted', -- 'minted' | 'transferred' | 'burned'
  minted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nft_gifts_owner
  ON nft_gifts (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_nft_gifts_creator
  ON nft_gifts (creator_id, minted_at DESC);

CREATE TABLE IF NOT EXISTS nft_transfers (
  id           TEXT        PRIMARY KEY,
  nft_id       TEXT        NOT NULL REFERENCES nft_gifts(id),
  from_user_id TEXT        NOT NULL,
  to_user_id   TEXT        NOT NULL,
  price_gst    BIGINT      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nft_transfers_nft
  ON nft_transfers (nft_id, created_at DESC);

-- ── staking-engine ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staking_positions (
  id                TEXT        PRIMARY KEY,
  user_id           TEXT        NOT NULL,
  creator_id        TEXT        NOT NULL,
  staked_gst        BIGINT      NOT NULL CHECK (staked_gst > 0),
  pending_yield_gst BIGINT      NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'unstaking' | 'completed'
  locked_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staking_user
  ON staking_positions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_staking_creator
  ON staking_positions (creator_id, status);

-- ── revenue-distribution ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_revenue_splits (
  creator_id   TEXT    PRIMARY KEY,
  creator_pct  NUMERIC NOT NULL DEFAULT 70 CHECK (creator_pct  BETWEEN 0 AND 100),
  agency_pct   NUMERIC NOT NULL DEFAULT 10 CHECK (agency_pct   BETWEEN 0 AND 100),
  platform_pct NUMERIC NOT NULL DEFAULT 15 CHECK (platform_pct BETWEEN 0 AND 100),
  growth_pct   NUMERIC NOT NULL DEFAULT  5 CHECK (growth_pct   BETWEEN 0 AND 100),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_distributions (
  id           TEXT        PRIMARY KEY,
  creator_id   TEXT        NOT NULL,
  source       TEXT        NOT NULL,
  ref_id       TEXT,
  total_gst    BIGINT      NOT NULL,
  creator_gst  BIGINT      NOT NULL,
  agency_gst   BIGINT      NOT NULL,
  platform_gst BIGINT      NOT NULL,
  growth_gst   BIGINT      NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rev_dist_creator
  ON revenue_distributions (creator_id, created_at DESC);

-- ── fan-dao ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dao_proposals (
  id             TEXT        PRIMARY KEY,
  creator_id     TEXT        NOT NULL,
  proposer_id    TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  description    TEXT,
  category       TEXT        NOT NULL DEFAULT 'general',
  options        JSONB       NOT NULL DEFAULT '["yes","no"]',
  status         TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'passed' | 'rejected' | 'expired'
  vote_end       TIMESTAMPTZ NOT NULL,
  yes_weight     BIGINT      NOT NULL DEFAULT 0,
  no_weight      BIGINT      NOT NULL DEFAULT 0,
  total_weight   BIGINT      NOT NULL DEFAULT 0,
  quorum_reached BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dao_proposals_creator
  ON dao_proposals (creator_id, status);

CREATE TABLE IF NOT EXISTS dao_votes (
  id          TEXT        PRIMARY KEY,
  proposal_id TEXT        NOT NULL REFERENCES dao_proposals(id),
  voter_id    TEXT        NOT NULL,
  option      TEXT        NOT NULL,
  weight      BIGINT      NOT NULL DEFAULT 1,
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_dao_votes_proposal
  ON dao_votes (proposal_id);

-- ── marketplace ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id            TEXT        PRIMARY KEY,
  seller_id     TEXT        NOT NULL,
  creator_id    TEXT        NOT NULL,
  item_type     TEXT        NOT NULL,   -- 'nft' | 'token' | 'membership'
  item_id       TEXT        NOT NULL,
  price_gst     BIGINT      NOT NULL CHECK (price_gst > 0),
  quantity      INTEGER     NOT NULL DEFAULT 1,
  title         TEXT        NOT NULL,
  description   TEXT,
  thumbnail_url TEXT,
  status        TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'sold' | 'cancelled'
  listed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_creator
  ON marketplace_listings (creator_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_seller
  ON marketplace_listings (seller_id, status);

CREATE TABLE IF NOT EXISTS marketplace_sales (
  id          TEXT        PRIMARY KEY,
  listing_id  TEXT        NOT NULL REFERENCES marketplace_listings(id),
  buyer_id    TEXT        NOT NULL,
  seller_id   TEXT        NOT NULL,
  creator_id  TEXT        NOT NULL,
  item_type   TEXT        NOT NULL,
  item_id     TEXT        NOT NULL,
  quantity    INTEGER     NOT NULL DEFAULT 1,
  price_gst   BIGINT      NOT NULL,
  total_gst   BIGINT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sales_buyer
  ON marketplace_sales (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_sales_creator
  ON marketplace_sales (creator_id, created_at DESC);

COMMIT;
