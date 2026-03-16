/**
 * GGVN — Ghost Global Validator Network
 *
 * Coordinates the GhostChain validator set across all three layers.
 * Provides:
 *   - Validator registry (stake, status, performance, commission)
 *   - Staking operations (delegate, undelegate, redelegate)
 *   - Slashing event coordination
 *   - Peer gossip registry (peer discovery)
 *   - Uptime and performance tracking
 *
 * REST API:
 *   GET  /v/validators              — list all validators
 *   GET  /v/validators/:address     — validator detail
 *   POST /v/validators              — register validator
 *   POST /v/stake/delegate          — delegate GST to validator
 *   POST /v/stake/undelegate        — begin unbonding
 *   POST /v/stake/redelegate        — redelegate to different validator
 *   GET  /v/delegations/:address    — delegations for address
 *   POST /v/slash                   — report slash event (governance only)
 *   GET  /v/peers                   — peer list for gossip
 *   POST /v/peers/announce          — announce new peer
 *   GET  /v/stats                   — network-wide stats
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT    = parseInt(process.env.GGVN_PORT ?? '7720', 10);
const DB_PATH = process.env.GGVN_DB ?? './ggvn.db';

// Minimum stake: 100,000 GST (10^23 wei)
const MIN_STAKE_GST = 100_000n * (10n ** 18n);
// Unbonding period: 21 days in seconds
const UNBONDING_PERIOD_SECS = 21 * 24 * 60 * 60;
// Max commission: 20%
const MAX_COMMISSION_BPS = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GhostValidator {
  address:       string;
  publicKey:     string;
  moniker:       string;        // human-readable name
  website:       string;
  description:   string;
  stake:         string;        // total delegated GST (wei, decimal string)
  selfStake:     string;        // validator's own stake
  commission:    number;        // basis points
  status:        'active' | 'jailed' | 'inactive';
  uptimePercent: number;
  blocksProposed: number;
  blocksSigned:  number;
  slashCount:    number;
  layer:         'l1' | 'l2' | 'l3';
  rpcEndpoint:   string;
  p2pEndpoint:   string;
  registeredAt:  number;
  lastSeen:      number;
}

export interface GhostDelegation {
  id:          string;
  delegator:   string;
  validator:   string;
  amount:      string;       // GST wei
  status:      'bonded' | 'unbonding' | 'unbonded';
  unbondEnd:   number | null; // unix timestamp
  createdAt:   number;
}

export interface GhostSlashEvent {
  id:        string;
  validator: string;
  reason:    'double_sign' | 'downtime' | 'equivocation';
  slashBps:  number;        // basis points slashed
  jailDays:  number;
  evidence:  string;        // block hash or tx hash of evidence
  timestamp: number;
}

export interface GhostPeer {
  peerId:      string;
  address:     string;
  p2pEndpoint: string;
  rpcEndpoint: string;
  layer:       'l1' | 'l2' | 'l3';
  lastSeen:    number;
}

// ─── Database ─────────────────────────────────────────────────────────────────

function openDB(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS validators (
      address         TEXT PRIMARY KEY,
      public_key      TEXT NOT NULL,
      moniker         TEXT NOT NULL DEFAULT '',
      website         TEXT NOT NULL DEFAULT '',
      description     TEXT NOT NULL DEFAULT '',
      stake           TEXT NOT NULL DEFAULT '0',
      self_stake      TEXT NOT NULL DEFAULT '0',
      commission      INTEGER NOT NULL DEFAULT 500,
      status          TEXT NOT NULL DEFAULT 'active',
      uptime_percent  REAL NOT NULL DEFAULT 100.0,
      blocks_proposed INTEGER NOT NULL DEFAULT 0,
      blocks_signed   INTEGER NOT NULL DEFAULT 0,
      slash_count     INTEGER NOT NULL DEFAULT 0,
      layer           TEXT NOT NULL DEFAULT 'l1',
      rpc_endpoint    TEXT NOT NULL DEFAULT '',
      p2p_endpoint    TEXT NOT NULL DEFAULT '',
      registered_at   INTEGER NOT NULL,
      last_seen       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS delegations (
      id          TEXT PRIMARY KEY,
      delegator   TEXT NOT NULL,
      validator   TEXT NOT NULL,
      amount      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'bonded',
      unbond_end  INTEGER,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY(validator) REFERENCES validators(address)
    );
    CREATE INDEX IF NOT EXISTS idx_del_delegator ON delegations(delegator);
    CREATE INDEX IF NOT EXISTS idx_del_validator  ON delegations(validator);

    CREATE TABLE IF NOT EXISTS slash_events (
      id        TEXT PRIMARY KEY,
      validator TEXT NOT NULL,
      reason    TEXT NOT NULL,
      slash_bps INTEGER NOT NULL,
      jail_days INTEGER NOT NULL,
      evidence  TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS peers (
      peer_id       TEXT PRIMARY KEY,
      address       TEXT NOT NULL,
      p2p_endpoint  TEXT NOT NULL,
      rpc_endpoint  TEXT NOT NULL,
      layer         TEXT NOT NULL DEFAULT 'l1',
      last_seen     INTEGER NOT NULL
    );
  `);
  return db;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function startGGVN(): void {
  const db  = openDB(DB_PATH);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  // Health
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'GGVN', network: 'GhostChain', nativeToken: 'GST' });
  });

  // ── Validators ────────────────────────────────────────────────────────────

  app.get('/v/validators', (req, res) => {
    const layer  = req.query.layer as string;
    const status = req.query.status as string;
    let sql = 'SELECT * FROM validators WHERE 1=1';
    const params: string[] = [];
    if (layer)  { sql += ' AND layer=?';  params.push(layer);  }
    if (status) { sql += ' AND status=?'; params.push(status); }
    sql += ' ORDER BY CAST(stake AS REAL) DESC';
    const rows = db.prepare(sql).all(...params);
    res.json({ validators: rows, count: rows.length, nativeToken: 'GST' });
  });

  app.get('/v/validators/:address', (req, res) => {
    const v = db.prepare('SELECT * FROM validators WHERE address=?').get(req.params.address.toLowerCase());
    if (!v) return void res.status(404).json({ error: 'Validator not found' });
    const delegations = db.prepare("SELECT COUNT(*) as c, SUM(CAST(amount as REAL)) as total FROM delegations WHERE validator=? AND status='bonded'").get(req.params.address.toLowerCase());
    res.json({ ...v as object, delegationStats: delegations });
  });

  app.post('/v/validators', (req, res) => {
    try {
      const {
        address, publicKey, moniker = '', website = '', description = '',
        selfStake, commission = 500, layer = 'l1', rpcEndpoint = '', p2pEndpoint = ''
      } = req.body as Record<string, string | number>;

      if (!address || !publicKey || !selfStake) {
        return void res.status(400).json({ error: 'address, publicKey, selfStake required' });
      }

      const stake = BigInt(selfStake as string);
      if (stake < MIN_STAKE_GST) {
        return void res.status(400).json({ error: 'Minimum self-stake is 100,000 GST' });
      }

      const comm = Number(commission);
      if (comm > MAX_COMMISSION_BPS) {
        return void res.status(400).json({ error: 'Commission cannot exceed 20% (2000 bps)' });
      }

      const addr = (address as string).toLowerCase();
      const now  = Date.now();

      db.prepare(`
        INSERT OR REPLACE INTO validators
          (address, public_key, moniker, website, description, stake, self_stake, commission, status, layer, rpc_endpoint, p2p_endpoint, registered_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).run(addr, publicKey, moniker, website, description, stake.toString(), stake.toString(), comm, layer, rpcEndpoint, p2pEndpoint, now, now);

      res.status(201).json({ address: addr, status: 'active', message: 'Validator registered on GGVN' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ── Staking ───────────────────────────────────────────────────────────────

  app.post('/v/stake/delegate', (req, res) => {
    try {
      const { delegator, validator, amount } = req.body as Record<string, string>;
      if (!delegator || !validator || !amount) {
        return void res.status(400).json({ error: 'delegator, validator, amount required' });
      }

      const v = db.prepare('SELECT * FROM validators WHERE address=?').get(validator.toLowerCase()) as GhostValidator | undefined;
      if (!v) return void res.status(404).json({ error: 'Validator not found' });
      if (v.status !== 'active') return void res.status(400).json({ error: 'Validator is not active' });

      const id  = crypto.randomUUID();
      const now = Date.now();
      const delegate = db.transaction(() => {
        db.prepare(`
          INSERT INTO delegations(id, delegator, validator, amount, status, created_at)
          VALUES (?, ?, ?, ?, 'bonded', ?)
        `).run(id, delegator.toLowerCase(), validator.toLowerCase(), amount, now);

        const newStake = (BigInt(v.stake) + BigInt(amount)).toString();
        db.prepare('UPDATE validators SET stake=?, last_seen=? WHERE address=?')
          .run(newStake, now, validator.toLowerCase());
      });
      delegate();

      res.status(201).json({ delegationId: id, status: 'bonded', nativeToken: 'GST' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post('/v/stake/undelegate', (req, res) => {
    try {
      const { delegationId } = req.body as { delegationId: string };
      const del = db.prepare("SELECT * FROM delegations WHERE id=? AND status='bonded'").get(delegationId) as GhostDelegation | undefined;
      if (!del) return void res.status(404).json({ error: 'Bonded delegation not found' });

      const unbondEnd = Math.floor(Date.now() / 1000) + UNBONDING_PERIOD_SECS;
      db.prepare("UPDATE delegations SET status='unbonding', unbond_end=? WHERE id=?").run(unbondEnd, delegationId);

      // Reduce validator stake
      const v = db.prepare('SELECT stake FROM validators WHERE address=?').get(del.validator) as { stake: string } | undefined;
      if (v) {
        const newStake = (BigInt(v.stake) - BigInt(del.amount)).toString();
        db.prepare('UPDATE validators SET stake=? WHERE address=?').run(newStake, del.validator);
      }

      res.json({ delegationId, status: 'unbonding', unbondEnd, unbondingDays: 21, nativeToken: 'GST' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get('/v/delegations/:address', (req, res) => {
    const delegations = db.prepare(
      'SELECT * FROM delegations WHERE delegator=? ORDER BY created_at DESC'
    ).all(req.params.address.toLowerCase());
    res.json({ delegations, address: req.params.address });
  });

  // ── Slashing ──────────────────────────────────────────────────────────────

  app.post('/v/slash', (req, res) => {
    try {
      // In production: require governance JWT / multisig attestation
      const { validator, reason, slashBps = 500, jailDays = 7, evidence } = req.body as Record<string, string | number>;
      if (!validator || !reason || !evidence) {
        return void res.status(400).json({ error: 'validator, reason, evidence required' });
      }

      const v = db.prepare('SELECT * FROM validators WHERE address=?').get((validator as string).toLowerCase()) as GhostValidator | undefined;
      if (!v) return void res.status(404).json({ error: 'Validator not found' });

      const bps  = BigInt(Number(slashBps));
      const slashed = (BigInt(v.stake) * bps) / 10_000n;
      const newStake = (BigInt(v.stake) - slashed).toString();
      const id   = crypto.randomUUID();
      const now  = Date.now();

      const doSlash = db.transaction(() => {
        db.prepare(`
          INSERT INTO slash_events(id, validator, reason, slash_bps, jail_days, evidence, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, (validator as string).toLowerCase(), reason, Number(slashBps), Number(jailDays), evidence, now);

        db.prepare("UPDATE validators SET stake=?, status='jailed', slash_count=slash_count+1, last_seen=? WHERE address=?")
          .run(newStake, now, (validator as string).toLowerCase());
      });
      doSlash();

      res.json({ slashEventId: id, slashed: slashed.toString(), newStake, status: 'jailed', nativeToken: 'GST' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ── Peers ─────────────────────────────────────────────────────────────────

  app.get('/v/peers', (req, res) => {
    const layer = req.query.layer as string;
    const cutoff = Date.now() - 5 * 60 * 1000; // active within last 5 minutes
    let sql = 'SELECT * FROM peers WHERE last_seen >= ?';
    const params: (string | number)[] = [cutoff];
    if (layer) { sql += ' AND layer=?'; params.push(layer); }
    sql += ' ORDER BY last_seen DESC LIMIT 200';
    const peers = db.prepare(sql).all(...params);
    res.json({ peers, count: peers.length });
  });

  app.post('/v/peers/announce', (req, res) => {
    try {
      const { peerId, address, p2pEndpoint, rpcEndpoint, layer = 'l1' } = req.body as Record<string, string>;
      if (!peerId || !p2pEndpoint) return void res.status(400).json({ error: 'peerId and p2pEndpoint required' });

      db.prepare(`
        INSERT OR REPLACE INTO peers(peer_id, address, p2p_endpoint, rpc_endpoint, layer, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(peerId, address ?? '', p2pEndpoint, rpcEndpoint ?? '', layer, Date.now());

      res.json({ peerId, status: 'announced' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  app.get('/v/stats', (_req, res) => {
    const { total } = db.prepare('SELECT COUNT(*) as total FROM validators').get() as { total: number };
    const { active } = db.prepare("SELECT COUNT(*) as active FROM validators WHERE status='active'").get() as { active: number };
    const { jailed } = db.prepare("SELECT COUNT(*) as jailed FROM validators WHERE status='jailed'").get() as { jailed: number };
    const { totalStake } = db.prepare("SELECT SUM(CAST(stake as REAL)) as totalStake FROM validators WHERE status='active'").get() as { totalStake: number | null };
    const { slashEvents } = db.prepare('SELECT COUNT(*) as slashEvents FROM slash_events').get() as { slashEvents: number };
    const { peers } = db.prepare('SELECT COUNT(*) as peers FROM peers WHERE last_seen >= ?').get(Date.now() - 5 * 60 * 1000) as { peers: number };

    res.json({
      network: 'GhostChain',
      nativeToken: 'GST',
      service: 'GGVN',
      validators: { total, active, jailed },
      totalStakedGST: totalStake?.toFixed(0) ?? '0',
      slashEvents,
      activePeers: peers,
      minStake: MIN_STAKE_GST.toString(),
      unbondingPeriodDays: 21,
    });
  });

  app.listen(PORT, () => {
    console.log(`GGVN — Ghost Global Validator Network running on port ${PORT}`);
    console.log(`  Network: GhostChain | Token: GST | Min stake: 100k GST`);
  });
}

startGGVN();
