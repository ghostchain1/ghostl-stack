import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { ethers } from 'ethers';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT              = Number(process.env.PORT              ?? 7022);
const JWT_SECRET        = process.env.JWT_SECRET               ?? 'litvyblive-dev-secret';
const DATA_DIR          = process.env.DATA_DIR                 ?? '/tmp/litvyblive/treasury';
const REDIS_URL         = process.env.REDIS_URL                ?? 'redis://localhost:6379';
const GHOST_L3_RPC      = process.env.GHOST_L3_RPC             ?? 'http://localhost:39545';
const GHOST_L3_CHAIN_ID = 903;

// Revenue split: 70% creator, 15% agency, 15% platform (LGE treasury)
const CREATOR_SHARE  = 0.70;
const PLATFORM_SHARE = 0.15;

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/treasury.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS vaults (
    creator_id      TEXT PRIMARY KEY,
    vault_balance   REAL DEFAULT 0,
    staked_balance  REAL DEFAULT 0,
    pending_rewards REAL DEFAULT 0,
    total_earned    REAL DEFAULT 0,
    total_withdrawn REAL DEFAULT 0,
    updated_at      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS treasury_txs (
    id          TEXT PRIMARY KEY,
    creator_id  TEXT NOT NULL,
    type        TEXT NOT NULL,
    amount_gst  REAL NOT NULL,
    to_address  TEXT,
    status      TEXT DEFAULT 'confirmed',
    tx_hash     TEXT,
    chain_id    INTEGER DEFAULT 903,
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS platform_ledger (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    amount_gst  REAL NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ttx_creator ON treasury_txs(creator_id, created_at);
`);

let provider: ethers.JsonRpcProvider | undefined;
try {
  provider = new ethers.JsonRpcProvider(GHOST_L3_RPC, { chainId: GHOST_L3_CHAIN_ID, name: 'ghostl3' });
} catch {
  log.warn('GhostL3 RPC unavailable');
}

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

function ensureVault(creatorId: string): void {
  if (!db.prepare('SELECT creator_id FROM vaults WHERE creator_id=?').get(creatorId)) {
    db.prepare('INSERT INTO vaults (creator_id, updated_at) VALUES (?,?)').run(creatorId, new Date().toISOString());
  }
}

interface AuthReq extends Request { userId?: string }
function requireAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try { req.userId = (jwt.verify(h.slice(7), JWT_SECRET) as { userId: string }).userId; next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'treasury-service', chain: GHOST_L3_CHAIN_ID }));

// ── GET /treasury/:creatorId ──────────────────────────────────────────────────
app.get('/:creatorId', requireAuth, (req: AuthReq, res) => {
  if (req.params['creatorId'] !== req.userId!) {
    res.status(403).json({ error: 'Access denied — can only view your own treasury' }); return;
  }
  ensureVault(req.userId!);
  const vault = db.prepare('SELECT * FROM vaults WHERE creator_id=?').get(req.userId!);
  res.json({ ...(vault as object), chainId: GHOST_L3_CHAIN_ID });
});

// ── POST /treasury/:creatorId/stake ───────────────────────────────────────────
const stakeSchema = z.object({ amount: z.number().positive(), chainId: z.literal(GHOST_L3_CHAIN_ID) });

app.post('/:creatorId/stake', requireAuth, (req: AuthReq, res) => {
  if (req.params['creatorId'] !== req.userId!) { res.status(403).json({ error: 'Access denied' }); return; }
  const parsed = stakeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount } = parsed.data;
  ensureVault(req.userId!);
  const vault = db.prepare('SELECT vault_balance FROM vaults WHERE creator_id=?').get(req.userId!) as { vault_balance: number } | undefined;
  if (!vault || vault.vault_balance < amount) { res.status(400).json({ error: 'Insufficient vault balance' }); return; }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE vaults SET vault_balance = vault_balance - ?, staked_balance = staked_balance + ?, updated_at=? WHERE creator_id=?').run(amount, amount, now, req.userId!);
    db.prepare('INSERT INTO treasury_txs (id,creator_id,type,amount_gst,chain_id,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), req.userId!, 'stake', amount, GHOST_L3_CHAIN_ID, now);
  })();
  res.json({ success: true, stakedAmount: amount, chainId: GHOST_L3_CHAIN_ID });
});

// ── POST /treasury/:creatorId/unstake ─────────────────────────────────────────
app.post('/:creatorId/unstake', requireAuth, (req: AuthReq, res) => {
  if (req.params['creatorId'] !== req.userId!) { res.status(403).json({ error: 'Access denied' }); return; }
  const parsed = stakeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount } = parsed.data;
  ensureVault(req.userId!);
  const vault = db.prepare('SELECT staked_balance FROM vaults WHERE creator_id=?').get(req.userId!) as { staked_balance: number } | undefined;
  if (!vault || vault.staked_balance < amount) { res.status(400).json({ error: 'Insufficient staked balance' }); return; }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE vaults SET staked_balance = staked_balance - ?, vault_balance = vault_balance + ?, updated_at=? WHERE creator_id=?').run(amount, amount, now, req.userId!);
    db.prepare('INSERT INTO treasury_txs (id,creator_id,type,amount_gst,chain_id,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), req.userId!, 'unstake', amount, GHOST_L3_CHAIN_ID, now);
  })();
  res.json({ success: true, unstakedAmount: amount, chainId: GHOST_L3_CHAIN_ID });
});

// ── POST /treasury/:creatorId/withdraw ────────────────────────────────────────
const withdrawSchema = z.object({
  amount:    z.number().positive(),
  toAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId:   z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/:creatorId/withdraw', requireAuth, (req: AuthReq, res) => {
  if (req.params['creatorId'] !== req.userId!) { res.status(403).json({ error: 'Access denied' }); return; }
  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount, toAddress } = parsed.data;
  ensureVault(req.userId!);
  const vault = db.prepare('SELECT vault_balance FROM vaults WHERE creator_id=?').get(req.userId!) as { vault_balance: number } | undefined;
  if (!vault || vault.vault_balance < amount) { res.status(400).json({ error: 'Insufficient vault balance' }); return; }

  const txId = uuid();
  const now  = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE vaults SET vault_balance = vault_balance - ?, total_withdrawn = total_withdrawn + ?, updated_at=? WHERE creator_id=?').run(amount, amount, now, req.userId!);
    db.prepare('INSERT INTO treasury_txs (id,creator_id,type,amount_gst,to_address,status,chain_id,created_at) VALUES (?,?,?,?,?,?,?,?)').run(txId, req.userId!, 'withdraw', amount, toAddress, 'queued', GHOST_L3_CHAIN_ID, now);
  })();
  // Signal wallet-service to execute on-chain withdrawal
  redis.publish('treasury:withdraw', JSON.stringify({ txId, creatorId: req.userId!, amount, toAddress, chainId: GHOST_L3_CHAIN_ID })).catch(() => null);
  res.json({ txId, amount, toAddress, status: 'queued', chainId: GHOST_L3_CHAIN_ID });
});

// ── GET /treasury/:creatorId/history ──────────────────────────────────────────
app.get('/:creatorId/history', requireAuth, (req: AuthReq, res) => {
  if (req.params['creatorId'] !== req.userId!) { res.status(403).json({ error: 'Access denied' }); return; }
  const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
  const rows  = db.prepare('SELECT * FROM treasury_txs WHERE creator_id=? ORDER BY created_at DESC LIMIT ?').all(req.userId!, limit);
  res.json(rows);
});

// ── GET /treasury/platform/summary (admin) ────────────────────────────────────
app.get('/platform/summary', requireAuth, (_req, res) => {
  const total = (db.prepare('SELECT COALESCE(SUM(amount_gst),0) as total FROM platform_ledger').get() as { total: number }).total;
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM vaults').get() as { cnt: number }).cnt;
  res.json({ totalPlatformFees: total, creatorVaultCount: count, chainId: GHOST_L3_CHAIN_ID });
});

// ── Redis: credit creator vault from gifts & game payouts ────────────────────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
sub.subscribe('gift:sent', 'wallet:credit', () => null);
sub.on('message', (ch, msg) => {
  try {
    if (ch === 'gift:sent') {
      const { creatorId, amount } = JSON.parse(msg) as { creatorId?: string; amount?: number };
      if (!creatorId || !amount) return;
      const creatorShare  = amount * CREATOR_SHARE;
      const platformShare = amount * PLATFORM_SHARE;
      const now = new Date().toISOString();
      ensureVault(creatorId);
      db.transaction(() => {
        db.prepare('UPDATE vaults SET vault_balance = vault_balance + ?, total_earned = total_earned + ?, pending_rewards = pending_rewards + ?, updated_at=? WHERE creator_id=?').run(creatorShare, creatorShare, 0, now, creatorId);
        db.prepare('INSERT INTO treasury_txs (id,creator_id,type,amount_gst,chain_id,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), creatorId, 'gift_income', creatorShare, GHOST_L3_CHAIN_ID, now);
        db.prepare('INSERT INTO platform_ledger (id,source,amount_gst,created_at) VALUES (?,?,?,?)').run(uuid(), `gift:${creatorId}`, platformShare, now);
      })();
    }
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Treasury service running on :${PORT} (GhostL3 chain ${GHOST_L3_CHAIN_ID})`));
