import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT             = Number(process.env.PORT             ?? 7021);
const JWT_SECRET       = process.env.JWT_SECRET              ?? 'litvyblive-dev-secret';
const DATA_DIR         = process.env.DATA_DIR                ?? '/tmp/litvyblive/launchpad';
const REDIS_URL        = process.env.REDIS_URL               ?? 'redis://localhost:6379';
const GHOST_L3_CHAIN_ID = 903;

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/launchpad.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS creator_tokens (
    id           TEXT PRIMARY KEY,
    creator_id   TEXT NOT NULL,
    name         TEXT NOT NULL,
    symbol       TEXT NOT NULL UNIQUE,
    description  TEXT DEFAULT '',
    total_supply REAL NOT NULL,
    price_gst    REAL NOT NULL,
    sold         REAL DEFAULT 0,
    status       TEXT DEFAULT 'active',
    chain_id     INTEGER DEFAULT 903,
    created_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS holdings (
    token_id     TEXT NOT NULL,
    holder_id    TEXT NOT NULL,
    amount       REAL NOT NULL,
    avg_price    REAL NOT NULL,
    purchased_at TEXT NOT NULL,
    PRIMARY KEY (token_id, holder_id)
  );
  CREATE TABLE IF NOT EXISTS purchase_log (
    id          TEXT PRIMARY KEY,
    token_id    TEXT NOT NULL,
    buyer_id    TEXT NOT NULL,
    amount      REAL NOT NULL,
    price_gst   REAL NOT NULL,
    total_cost  REAL NOT NULL,
    chain_id    INTEGER DEFAULT 903,
    purchased_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_holdings_holder ON holdings(holder_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_creator ON creator_tokens(creator_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_status ON creator_tokens(status);
`);

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

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

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'launchpad-service', chain: GHOST_L3_CHAIN_ID }));

// ── POST /launchpad/tokens — list creator token ───────────────────────────────
const createSchema = z.object({
  name:        z.string().min(2).max(50),
  symbol:      z.string().min(2).max(10).regex(/^[A-Z]+$/),
  description: z.string().max(500).optional(),
  totalSupply: z.number().positive().max(1_000_000_000),
  priceGst:    z.number().positive(),
  chainId:     z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/tokens', requireAuth, (req: AuthReq, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const existing = db.prepare('SELECT id FROM creator_tokens WHERE creator_id=?').get(req.userId!);
  if (existing) { res.status(409).json({ error: 'Creator already has a token — only one per creator' }); return; }
  const symExists = db.prepare('SELECT id FROM creator_tokens WHERE symbol=?').get(parsed.data.symbol);
  if (symExists) { res.status(409).json({ error: 'Token symbol already taken' }); return; }

  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO creator_tokens (id,creator_id,name,symbol,description,total_supply,price_gst,chain_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, req.userId!, parsed.data.name, parsed.data.symbol, parsed.data.description ?? '', parsed.data.totalSupply, parsed.data.priceGst, GHOST_L3_CHAIN_ID, now);

  redis.publish('launchpad:token:created', JSON.stringify({ id, creatorId: req.userId!, symbol: parsed.data.symbol, chainId: GHOST_L3_CHAIN_ID })).catch(() => null);
  res.status(201).json({ id, ...parsed.data, sold: 0, status: 'active', chainId: GHOST_L3_CHAIN_ID, createdAt: now });
});

// ── GET /launchpad/tokens — active tokens ─────────────────────────────────────
app.get('/tokens', (_req, res) => {
  const limit = Math.min(Number(_req.query['limit'] ?? 50), 200);
  const rows  = db.prepare(`
    SELECT ct.*, (ct.sold / ct.total_supply * 100) as percent_sold
    FROM creator_tokens ct WHERE status='active'
    ORDER BY ct.sold DESC LIMIT ?
  `).all(limit);
  res.json(rows);
});

// ── GET /launchpad/tokens/:id ─────────────────────────────────────────────────
app.get('/tokens/:id', (req, res) => {
  const token = db.prepare('SELECT * FROM creator_tokens WHERE id=?').get(req.params['id']) as Record<string, unknown> | undefined;
  if (!token) { res.status(404).json({ error: 'Token not found' }); return; }
  const holdersCount = (db.prepare('SELECT COUNT(*) as cnt FROM holdings WHERE token_id=?').get(req.params['id']) as { cnt: number }).cnt;
  res.json({ ...token, holdersCount });
});

// ── GET /launchpad/tokens/:id/holders ─────────────────────────────────────────
app.get('/tokens/:id/holders', (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
  const rows  = db.prepare('SELECT * FROM holdings WHERE token_id=? ORDER BY amount DESC LIMIT ?').all(req.params['id'], limit);
  res.json(rows);
});

// ── GET /launchpad/tokens/creator/:creatorId ──────────────────────────────────
app.get('/creator/:creatorId', (req, res) => {
  const token = db.prepare('SELECT * FROM creator_tokens WHERE creator_id=?').get(req.params['creatorId']);
  res.json(token ?? null);
});

// ── POST /launchpad/tokens/:id/buy ────────────────────────────────────────────
const buySchema = z.object({
  amount:  z.number().positive(),
  chainId: z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/tokens/:id/buy', requireAuth, (req: AuthReq, res) => {
  const parsed = buySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount } = parsed.data;

  const token = db.prepare('SELECT * FROM creator_tokens WHERE id=? AND status=?').get(req.params['id'], 'active') as {
    id: string; creator_id: string; price_gst: number; total_supply: number; sold: number;
  } | undefined;
  if (!token) { res.status(404).json({ error: 'Active token not found' }); return; }

  const remaining = token.total_supply - token.sold;
  if (amount > remaining) { res.status(400).json({ error: `Only ${remaining} tokens remaining` }); return; }

  const totalCost = amount * token.price_gst;
  const purchaseId = uuid();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare('UPDATE creator_tokens SET sold = sold + ? WHERE id=?').run(amount, token.id);
    db.prepare(`
      INSERT INTO holdings (token_id, holder_id, amount, avg_price, purchased_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(token_id, holder_id) DO UPDATE SET
        avg_price = (amount * avg_price + excluded.amount * excluded.avg_price) / (amount + excluded.amount),
        amount = amount + excluded.amount
    `).run(token.id, req.userId!, amount, token.price_gst, now);
    db.prepare('INSERT INTO purchase_log (id,token_id,buyer_id,amount,price_gst,total_cost,chain_id,purchased_at) VALUES (?,?,?,?,?,?,?,?)').run(purchaseId, token.id, req.userId!, amount, token.price_gst, totalCost, GHOST_L3_CHAIN_ID, now);
  })();

  // Debit buyer's wallet
  redis.publish('wallet:debit', JSON.stringify({ userId: req.userId!, amount: totalCost, type: 'token_purchase', chainId: GHOST_L3_CHAIN_ID })).catch(() => null);
  // Credit creator
  redis.publish('wallet:credit', JSON.stringify({ userId: token.creator_id, amount: totalCost * 0.9, type: 'token_sale', chainId: GHOST_L3_CHAIN_ID })).catch(() => null);
  redis.publish('launchpad:token:purchased', JSON.stringify({ purchaseId, tokenId: token.id, buyerId: req.userId!, amount, totalCost, chainId: GHOST_L3_CHAIN_ID })).catch(() => null);

  res.json({ purchaseId, tokenId: token.id, amount, priceGst: token.price_gst, totalCost, chainId: GHOST_L3_CHAIN_ID });
});

// ── GET /launchpad/my-holdings ────────────────────────────────────────────────
app.get('/my-holdings', requireAuth, (req: AuthReq, res) => {
  const rows = db.prepare(`
    SELECT h.*, ct.name, ct.symbol, ct.price_gst as current_price
    FROM holdings h
    JOIN creator_tokens ct ON h.token_id = ct.id
    WHERE h.holder_id = ?
    ORDER BY h.amount DESC
  `).all(req.userId!);
  res.json(rows);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Launchpad service running on :${PORT}`));
