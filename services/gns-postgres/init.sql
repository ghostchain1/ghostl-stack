-- ────────────────────────────────────────────────────────────────────────────
-- GNS PostgreSQL Schema
-- Ghost Name Service — canonical off-chain mirror of L1 registry state
--
-- Tables:
--   gns_names             Canonical name records (synced from L1 events)
--   gns_records           Per-name DNS / resolver records (A, AAAA, TXT, etc.)
--   gns_indexer_state     Indexer resume cursor (last indexed L1 block)
--   gns_dhcp_leases       Kea DHCP lease bindings (hostname → IP)
--   gns_validator_bindings Validator staking contract → GNS node bindings
--   gns_events            Append-only audit log of all indexed events
-- ────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy name search
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- exclusion constraints

-- ── gns_names ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gns_names (
    node         TEXT        PRIMARY KEY,        -- bytes32 hex node hash
    label        TEXT,                           -- human-readable label (e.g. "alice")
    full_name    TEXT GENERATED ALWAYS AS (
                     CASE WHEN label IS NULL THEN NULL
                          ELSE label || '.ghost'
                     END
                 ) STORED,
    owner        TEXT,                           -- current owner address (lowercase)
    resolver     TEXT,                           -- resolver contract address
    expiry_ts    TIMESTAMPTZ,                    -- when registration expires
    locked       BOOLEAN     DEFAULT FALSE,      -- governance-locked
    ip           TEXT,                           -- A record (IPv4) if DHCP-bound
    ipv6         TEXT,                           -- AAAA record (IPv6)
    last_tx      TEXT,                           -- last transaction hash
    last_block   BIGINT,                         -- last indexed block number
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gns_names_label   ON gns_names (label);
CREATE INDEX IF NOT EXISTS idx_gns_names_owner   ON gns_names (owner);
CREATE INDEX IF NOT EXISTS idx_gns_names_expiry  ON gns_names (expiry_ts) WHERE expiry_ts IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gns_names_trgm    ON gns_names USING gin (label gin_trgm_ops);

-- ── gns_records ───────────────────────────────────────────────────────────────
-- Stores per-record-type resolver data (mirrors GNSResolver.sol state)
CREATE TABLE IF NOT EXISTS gns_records (
    node         TEXT        NOT NULL,
    record_type  TEXT        NOT NULL,  -- 'A' | 'AAAA' | 'TXT' | 'CONTENT' | 'ABI' | 'ADDR_<coinType>'
    key          TEXT        NOT NULL DEFAULT '',  -- for TXT records: key name
    value        TEXT        NOT NULL,
    ttl          INT         NOT NULL DEFAULT 300,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (node, record_type, key),
    FOREIGN KEY (node) REFERENCES gns_names (node) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gns_records_node ON gns_records (node);

-- ── gns_indexer_state ─────────────────────────────────────────────────────────
-- Single-row table: stores the last successfully indexed L1 block
CREATE TABLE IF NOT EXISTS gns_indexer_state (
    id           INT         PRIMARY KEY DEFAULT 1,
    last_block   BIGINT      NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO gns_indexer_state (id, last_block) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- ── gns_dhcp_leases ───────────────────────────────────────────────────────────
-- Kea DHCP lease bindings: hostname → IP (dynamic; may change on every boot)
CREATE TABLE IF NOT EXISTS gns_dhcp_leases (
    hostname     TEXT        PRIMARY KEY,
    ip           TEXT        NOT NULL,
    ipv6         TEXT,
    mac          TEXT,
    valid_until  TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gns_dhcp_ip  ON gns_dhcp_leases (ip);
CREATE INDEX IF NOT EXISTS idx_gns_dhcp_mac ON gns_dhcp_leases (mac);

-- ── gns_validator_bindings ────────────────────────────────────────────────────
-- Maps on-chain staking validator IDs to their GNS node (val01.validator.ghost)
CREATE TABLE IF NOT EXISTS gns_validator_bindings (
    validator_id     BIGINT      PRIMARY KEY,
    node             TEXT        NOT NULL,
    staking_address  TEXT,
    label            TEXT,
    bound_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (node) REFERENCES gns_names (node) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gns_vb_node ON gns_validator_bindings (node);

-- ── gns_events ────────────────────────────────────────────────────────────────
-- Append-only event log for auditing and replay
CREATE TABLE IF NOT EXISTS gns_events (
    id           BIGSERIAL   PRIMARY KEY,
    event_type   TEXT        NOT NULL,           -- 'NameRegistered' | 'NameRenewed' | ...
    node         TEXT        NOT NULL,
    label        TEXT,
    data         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    tx_hash      TEXT,
    block_number BIGINT,
    indexed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gns_events_node    ON gns_events (node);
CREATE INDEX IF NOT EXISTS idx_gns_events_type    ON gns_events (event_type);
CREATE INDEX IF NOT EXISTS idx_gns_events_block   ON gns_events (block_number);
CREATE INDEX IF NOT EXISTS idx_gns_events_tx      ON gns_events (tx_hash);

-- ── Seed: reserved namespaces ─────────────────────────────────────────────────
-- These are permanently locked — mirroring GNSRegistry.sol constitutional reserves
INSERT INTO gns_names (node, label, owner, locked, expiry_ts)
VALUES
    -- ghost root (node = keccak256(0x00*32 ++ keccak256("ghost")))
    ('0xb3a3f8d04f3e0b3e5b5e3f7c9b9c9d9e1f2f3f4f5f6f7f8f9fafbfcfdfeff01',
     'ghost',        '0x0000000000000000000000000000000000000000', TRUE, NULL),
    -- validator reserved sub-namespace
    ('0xb3a3f8d04f3e0b3e5b5e3f7c9b9c9d9e1f2f3f4f5f6f7f8f9fafbfcfdfeff02',
     'validator',    '0x0000000000000000000000000000000000000000', TRUE, NULL),
    -- dao reserved sub-namespace
    ('0xb3a3f8d04f3e0b3e5b5e3f7c9b9c9d9e1f2f3f4f5f6f7f8f9fafbfcfdfeff03',
     'dao',          '0x0000000000000000000000000000000000000000', TRUE, NULL),
    -- treasury reserved sub-namespace
    ('0xb3a3f8d04f3e0b3e5b5e3f7c9b9c9d9e1f2f3f4f5f6f7f8f9fafbfcfdfeff04',
     'treasury',     '0x0000000000000000000000000000000000000000', TRUE, NULL)
ON CONFLICT (node) DO NOTHING;

-- ── Views ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW gns_active_names AS
    SELECT *
    FROM   gns_names
    WHERE  (expiry_ts IS NULL OR expiry_ts > NOW())
    AND    locked = FALSE;

CREATE OR REPLACE VIEW gns_expiring_soon AS
    SELECT *
    FROM   gns_names
    WHERE  expiry_ts IS NOT NULL
    AND    expiry_ts > NOW()
    AND    expiry_ts < NOW() + INTERVAL '30 days'
    ORDER BY expiry_ts;

CREATE OR REPLACE VIEW gns_validator_names AS
    SELECT
        gn.*,
        gvb.validator_id,
        gvb.staking_address
    FROM gns_names gn
    JOIN gns_validator_bindings gvb ON gn.node = gvb.node;
