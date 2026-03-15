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

const PORT       = Number(process.env.PORT      ?? 7014);
const JWT_SECRET = process.env.JWT_SECRET       ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR         ?? '/tmp/litvyblive/gift';
const REDIS_URL  = process.env.REDIS_URL        ?? 'redis://localhost:6379';
const GHOST_L3_CHAIN_ID = 903;

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/gift.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS gifts (
    id          TEXT PRIMARY KEY,
    stream_id   TEXT NOT NULL,
    sender_id   TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    gift_key    TEXT NOT NULL,
    gift_name   TEXT NOT NULL,
    price_gst   REAL NOT NULL,
    quantity    INTEGER DEFAULT 1,
    chain_id    INTEGER DEFAULT 903,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gifts_stream   ON gifts(stream_id);
  CREATE INDEX IF NOT EXISTS idx_gifts_sender   ON gifts(sender_id);
  CREATE INDEX IF NOT EXISTS idx_gifts_receiver ON gifts(receiver_id);
`);

// Catalogue of gifts with base GST prices
const GIFT_CATALOGUE = [
  { key: 'rose',    name: 'Rose',        price: 1,     emoji: '🌹' },
  { key: 'heart',   name: 'Heart',       price: 5,     emoji: '💖' },
  { key: 'crown',   name: 'Crown',       price: 50,    emoji: '👑' },
  { key: 'rocket',  name: 'Rocket',      price: 100,   emoji: '🚀' },
  { key: 'gem',     name: 'Ghost Gem',   price: 500,   emoji: '💎' },
  { key: 'dragon',  name: 'Ghost Dragon',price: 2000,  emoji: '🐉' },
] as const;

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

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'gift-service', chain: GHOST_L3_CHAIN_ID }));

// ── GET /gifts/catalogue ──────────────────────────────────────────────────────
app.get('/catalogue', (_req, res) => res.json(GIFT_CATALOGUE));

// ── POST /gifts/send ──────────────────────────────────────────────────────────
const sendSchema = z.object({
  streamId:   z.string().uuid(),
  receiverId: z.string().min(1),
  giftKey:    z.string().max(32),
  quantity:   z.number().int().min(1).max(99).default(1),
  chainId:    z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/send', requireAuth, (req: AuthReq, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { streamId, receiverId, giftKey, quantity } = parsed.data;

  const gift = GIFT_CATALOGUE.find(g => g.key === giftKey);
  if (!gift) { res.status(400).json({ error: `Unknown gift: ${giftKey}` }); return; }

  const totalGst = gift.price * quantity;
  const id  = uuid();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO gifts (id,stream_id,sender_id,receiver_id,gift_key,gift_name,price_gst,quantity,chain_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(id, streamId, req.userId!, receiverId, giftKey, gift.name, totalGst, quantity, GHOST_L3_CHAIN_ID, now);

  const event = { id, streamId, senderId: req.userId!, receiverId, giftKey, giftName: gift.name, emoji: gift.emoji, quantity, totalGst, chainId: GHOST_L3_CHAIN_ID };
  redis.publish('gift:sent', JSON.stringify({ ...event, amount: totalGst, creatorId: receiverId })).catch(() => null);
  redis.publish('chat:gift_announcement', JSON.stringify(event)).catch(() => null);

  res.status(201).json(event);
});

// ── POST /gifts/batch ─────────────────────────────────────────────────────────
const batchSchema = z.object({
  streamId:   z.string().uuid(),
  receiverId: z.string().min(1),
  chainId:    z.literal(GHOST_L3_CHAIN_ID),
  items: z.array(z.object({
    giftKey:  z.string().max(32),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(20),
});

app.post('/batch', requireAuth, (req: AuthReq, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { streamId, receiverId, items } = parsed.data;
  const now = new Date().toISOString();
  let totalGst = 0;

  const insert = db.prepare(
    'INSERT INTO gifts (id,stream_id,sender_id,receiver_id,gift_key,gift_name,price_gst,quantity,chain_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  const results: { giftKey: string; quantity: number; gstCost: number }[] = [];

  db.transaction(() => {
    for (const item of items) {
      const gift = GIFT_CATALOGUE.find(g => g.key === item.giftKey);
      if (!gift) throw new Error(`Unknown gift: ${item.giftKey}`);
      const cost = gift.price * item.quantity;
      insert.run(uuid(), streamId, req.userId!, receiverId, item.giftKey, gift.name, cost, item.quantity, GHOST_L3_CHAIN_ID, now);
      totalGst += cost;
      results.push({ giftKey: item.giftKey, quantity: item.quantity, gstCost: cost });
    }
  })();

  redis.publish('gift:sent', JSON.stringify({ streamId, senderId: req.userId!, receiverId, amount: totalGst, creatorId: receiverId })).catch(() => null);
  res.status(201).json({ success: true, items: results, totalGst, chainId: GHOST_L3_CHAIN_ID });
});

// ── GET /gifts/history/:userId ────────────────────────────────────────────────
app.get('/history/:userId', requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare(
    'SELECT * FROM gifts WHERE sender_id=? ORDER BY created_at DESC LIMIT ?',
  ).all(req.params['userId'], limit);
  res.json(rows);
});

// ── GET /gifts/received/:userId ───────────────────────────────────────────────
app.get('/received/:userId', requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare(
    'SELECT * FROM gifts WHERE receiver_id=? ORDER BY created_at DESC LIMIT ?',
  ).all(req.params['userId'], limit);
  res.json(rows);
});

// ── GET /gifts/stream/:streamId ───────────────────────────────────────────────
app.get('/stream/:streamId', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM gifts WHERE stream_id=? ORDER BY price_gst DESC LIMIT 100',
  ).all(req.params['streamId']);
  res.json(rows);
});

// ── GET /gifts/leaderboard/:streamId ─────────────────────────────────────────
app.get('/leaderboard/:streamId', (req, res) => {
  const rows = db.prepare(
    'SELECT sender_id, SUM(price_gst) as total_gst, COUNT(*) as gift_count FROM gifts WHERE stream_id=? GROUP BY sender_id ORDER BY total_gst DESC LIMIT 10',
  ).all(req.params['streamId']);
  res.json(rows);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Gift service running on :${PORT} (chain ${GHOST_L3_CHAIN_ID})`));
