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

const PORT       = Number(process.env.PORT           ?? 7015);
const JWT_SECRET = process.env.JWT_SECRET            ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR              ?? '/tmp/litvyblive/wallet';
const REDIS_URL  = process.env.REDIS_URL             ?? 'redis://localhost:6379';
const GHOST_L3_RPC = process.env.GHOST_L3_RPC        ?? 'http://localhost:7270';
const GHOST_L3_CHAIN_ID = 903;

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/wallet.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS balances (
    user_id     TEXT PRIMARY KEY,
    gst_balance REAL    DEFAULT 1000,
    staked_gst  REAL    DEFAULT 0,
    updated_at  TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL,
    amount_gst  REAL NOT NULL,
    to_address  TEXT,
    from_user   TEXT,
    status      TEXT DEFAULT 'confirmed',
    tx_hash     TEXT,
    chain_id    INTEGER DEFAULT 903,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at);
`);

// GhostL3 JSON-RPC provider (used for on-chain balance reads)
let provider: ethers.JsonRpcProvider | undefined;
try {
  provider = new ethers.JsonRpcProvider(GHOST_L3_RPC, { chainId: GHOST_L3_CHAIN_ID, name: 'ghostl3' });
} catch {
  log.warn('GhostL3 RPC unavailable — using ledger balances only');
}

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

interface AuthReq extends Request { userId?: string }
function requireAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try { req.userId = (jwt.verify(h.slice(7), JWT_SECRET) as { userId: string }).userId; next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function ensureBalance(userId: string): void {
  if (!db.prepare('SELECT user_id FROM balances WHERE user_id=?').get(userId)) {
    db.prepare('INSERT INTO balances (user_id, updated_at) VALUES (?,?)').run(userId, new Date().toISOString());
  }
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'wallet-service', chain: GHOST_L3_CHAIN_ID, rpc: GHOST_L3_RPC }));

// ── GET /wallet/balance ───────────────────────────────────────────────────────
app.get('/balance', requireAuth, (req: AuthReq, res) => {
  ensureBalance(req.userId!);
  const row = db.prepare('SELECT gst_balance, staked_gst FROM balances WHERE user_id=?').get(req.userId!) as
    { gst_balance: number; staked_gst: number } | undefined;
  res.json({
    gstBalance:  row?.gst_balance  ?? 0,
    stakedGst:   row?.staked_gst   ?? 0,
    pendingRewards: 0,
    chainId: GHOST_L3_CHAIN_ID,
  });
});

// ── GET /wallet/balance/onchain/:address ──────────────────────────────────────
app.get('/balance/onchain/:address', async (req, res) => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(req.params['address'])) {
    res.status(400).json({ error: 'Invalid address' }); return;
  }
  try {
    const balWei = await provider?.getBalance(req.params['address']);
    const balGst = balWei ? Number(ethers.formatEther(balWei)) : null;
    res.json({ address: req.params['address'], gstBalance: balGst, chainId: GHOST_L3_CHAIN_ID });
  } catch {
    res.status(503).json({ error: 'GhostL3 RPC unreachable' });
  }
});

// ── POST /wallet/deposit (credit internal ledger) ─────────────────────────────
const depositSchema = z.object({
  amount:  z.number().positive(),
  txHash:  z.string().optional(),
  chainId: z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/deposit', requireAuth, (req: AuthReq, res) => {
  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount, txHash } = parsed.data;
  ensureBalance(req.userId!);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE balances SET gst_balance = gst_balance + ?, updated_at=? WHERE user_id=?').run(amount, now, req.userId!);
    db.prepare('INSERT INTO transactions (id,user_id,type,amount_gst,tx_hash,chain_id,created_at) VALUES (?,?,?,?,?,?,?)').run(uuid(), req.userId!, 'deposit', amount, txHash ?? null, GHOST_L3_CHAIN_ID, now);
  })();
  redis.publish('wallet:deposit', JSON.stringify({ userId: req.userId!, amount, chainId: GHOST_L3_CHAIN_ID })).catch(() => null);
  res.json({ success: true, amount, chainId: GHOST_L3_CHAIN_ID });
});

// ── POST /wallet/withdraw ─────────────────────────────────────────────────────
const withdrawSchema = z.object({
  amount:    z.number().positive(),
  toAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId:   z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/withdraw', requireAuth, (req: AuthReq, res) => {
  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount, toAddress } = parsed.data;
  ensureBalance(req.userId!);
  const row = db.prepare('SELECT gst_balance FROM balances WHERE user_id=?').get(req.userId!) as { gst_balance: number } | undefined;
  if (!row || row.gst_balance < amount) { res.status(400).json({ error: 'Insufficient GST balance' }); return; }

  const txId = uuid();
  const now  = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE balances SET gst_balance = gst_balance - ?, updated_at=? WHERE user_id=?').run(amount, now, req.userId!);
    db.prepare('INSERT INTO transactions (id,user_id,type,amount_gst,to_address,status,chain_id,created_at) VALUES (?,?,?,?,?,?,?,?)').run(txId, req.userId!, 'withdraw', amount, toAddress, 'queued', GHOST_L3_CHAIN_ID, now);
  })();

  redis.publish('wallet:withdraw', JSON.stringify({ txId, userId: req.userId!, amount, toAddress, chainId: GHOST_L3_CHAIN_ID })).catch(() => null);
  res.json({ id: txId, amount, toAddress, status: 'queued', chainId: GHOST_L3_CHAIN_ID });
});

// ── POST /wallet/stake ────────────────────────────────────────────────────────
const stakeSchema = z.object({
  amount:  z.number().positive(),
  chainId: z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/stake', requireAuth, (req: AuthReq, res) => {
  const parsed = stakeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount } = parsed.data;
  ensureBalance(req.userId!);
  const row = db.prepare('SELECT gst_balance FROM balances WHERE user_id=?').get(req.userId!) as { gst_balance: number } | undefined;
  if (!row || row.gst_balance < amount) { res.status(400).json({ error: 'Insufficient GST balance' }); return; }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE balances SET gst_balance = gst_balance - ?, staked_gst = staked_gst + ?, updated_at=? WHERE user_id=?').run(amount, amount, now, req.userId!);
    db.prepare('INSERT INTO transactions (id,user_id,type,amount_gst,chain_id,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), req.userId!, 'stake', amount, GHOST_L3_CHAIN_ID, now);
  })();
  res.json({ success: true, stakedAmount: amount, chainId: GHOST_L3_CHAIN_ID });
});

// ── POST /wallet/unstake ──────────────────────────────────────────────────────
app.post('/unstake', requireAuth, (req: AuthReq, res) => {
  const parsed = stakeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount } = parsed.data;
  ensureBalance(req.userId!);
  const row = db.prepare('SELECT staked_gst FROM balances WHERE user_id=?').get(req.userId!) as { staked_gst: number } | undefined;
  if (!row || row.staked_gst < amount) { res.status(400).json({ error: 'Insufficient staked GST' }); return; }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE balances SET staked_gst = staked_gst - ?, gst_balance = gst_balance + ?, updated_at=? WHERE user_id=?').run(amount, amount, now, req.userId!);
    db.prepare('INSERT INTO transactions (id,user_id,type,amount_gst,chain_id,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), req.userId!, 'unstake', amount, GHOST_L3_CHAIN_ID, now);
  })();
  res.json({ success: true, unstakedAmount: amount, chainId: GHOST_L3_CHAIN_ID });
});

// ── GET /wallet/history ───────────────────────────────────────────────────────
app.get('/history', requireAuth, (req: AuthReq, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(req.userId!, limit);
  res.json(rows);
});

// ── GET /wallet/treasury/:userId (creator treasury view) ──────────────────────
app.get('/treasury/:userId', requireAuth, (req, res) => {
  const userId = req.params['userId'] as string;
  ensureBalance(userId);
  const row = db.prepare('SELECT gst_balance, staked_gst FROM balances WHERE user_id=?').get(userId) as { gst_balance: number; staked_gst: number } | undefined;
  res.json({ vaultBalance: row?.gst_balance ?? 0, stakedBalance: row?.staked_gst ?? 0, chainId: GHOST_L3_CHAIN_ID });
});

// ── Internal: credit wallet from gift events ──────────────────────────────────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
sub.subscribe('gift:sent', () => null);
sub.on('message', (_ch, msg) => {
  try {
    const { creatorId, amount } = JSON.parse(msg) as { creatorId?: string; amount?: number };
    if (!creatorId || !amount) return;
    ensureBalance(creatorId);
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE balances SET gst_balance = gst_balance + ?, updated_at=? WHERE user_id=?').run(amount * 0.85, now, creatorId); // 85% to creator
      db.prepare('INSERT INTO transactions (id,user_id,type,amount_gst,chain_id,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), creatorId, 'gift_income', amount * 0.85, GHOST_L3_CHAIN_ID, now);
    })();
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Wallet service running on :${PORT} (GhostL3 chain ${GHOST_L3_CHAIN_ID})`));
