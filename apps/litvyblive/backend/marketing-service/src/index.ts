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
import axios from 'axios';

const PORT          = Number(process.env.PORT          ?? 7023);
const JWT_SECRET    = process.env.JWT_SECRET           ?? 'litvyblive-dev-secret';
const DATA_DIR      = process.env.DATA_DIR             ?? '/tmp/litvyblive/marketing';
const REDIS_URL     = process.env.REDIS_URL            ?? 'redis://localhost:6379';
const GHOSTBRAIN    = process.env.GHOSTBRAIN_URL       ?? 'http://localhost:7900';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/marketing.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id           TEXT PRIMARY KEY,
    creator_id   TEXT NOT NULL,
    type         TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT DEFAULT '',
    budget_gst   REAL NOT NULL,
    spent_gst    REAL DEFAULT 0,
    status       TEXT DEFAULT 'draft',
    target_views INTEGER DEFAULT 0,
    impressions  INTEGER DEFAULT 0,
    clicks       INTEGER DEFAULT 0,
    conversions  INTEGER DEFAULT 0,
    start_at     TEXT,
    end_at       TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS referrals (
    id          TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referred_id TEXT NOT NULL,
    reward_gst  REAL DEFAULT 50,
    status      TEXT DEFAULT 'pending',
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS growth_events (
    id          TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    user_id     TEXT,
    metadata    TEXT DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_campaigns_creator ON campaigns(creator_id, status);
  CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
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
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'marketing-service' }));

// ── POST /marketing/campaigns ─────────────────────────────────────────────────
const campaignSchema = z.object({
  type:        z.enum(['stream-boost', 'banner-ad', 'push-promo', 'referral-boost', 'gift-multiplier']),
  title:       z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  budgetGst:   z.number().positive(),
  targetViews: z.number().min(0).optional(),
  startAt:     z.string().datetime().optional(),
  endAt:       z.string().datetime().optional(),
});

app.post('/campaigns', requireAuth, (req: AuthReq, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO campaigns (id,creator_id,type,title,description,budget_gst,target_views,start_at,end_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(id, req.userId!, parsed.data.type, parsed.data.title, parsed.data.description ?? '', parsed.data.budgetGst, parsed.data.targetViews ?? 0, parsed.data.startAt ?? null, parsed.data.endAt ?? null, now);
  res.status(201).json({ id, ...parsed.data, creatorId: req.userId!, status: 'draft', createdAt: now });
});

// ── GET /marketing/campaigns ──────────────────────────────────────────────────
app.get('/campaigns', requireAuth, (req: AuthReq, res) => {
  const status = (req.query['status'] as string) ?? 'all';
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM campaigns WHERE creator_id=? ORDER BY created_at DESC LIMIT 50').all(req.userId!)
    : db.prepare('SELECT * FROM campaigns WHERE creator_id=? AND status=? ORDER BY created_at DESC LIMIT 50').all(req.userId!, status);
  res.json(rows);
});

// ── GET /marketing/campaigns/:id ──────────────────────────────────────────────
app.get('/campaigns/:id', requireAuth, (req: AuthReq, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id=? AND creator_id=?').get(req.params['id'], req.userId!) as Record<string, unknown> | undefined;
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
  res.json(campaign);
});

// ── POST /marketing/campaigns/:id/activate ────────────────────────────────────
app.post('/campaigns/:id/activate', requireAuth, (req: AuthReq, res) => {
  const campaign = db.prepare('SELECT id, status FROM campaigns WHERE id=? AND creator_id=?').get(req.params['id'], req.userId!) as { id: string; status: string } | undefined;
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
  if (campaign.status === 'active') { res.status(400).json({ error: 'Campaign already active' }); return; }
  db.prepare('UPDATE campaigns SET status=? WHERE id=?').run('active', campaign.id);
  redis.publish('marketing:campaign:activated', JSON.stringify({ id: campaign.id, creatorId: req.userId! })).catch(() => null);
  res.json({ success: true, status: 'active' });
});

// ── POST /marketing/campaigns/:id/pause ──────────────────────────────────────
app.post('/campaigns/:id/pause', requireAuth, (req: AuthReq, res) => {
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id=? AND creator_id=?').get(req.params['id'], req.userId!) as { id: string } | undefined;
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
  db.prepare('UPDATE campaigns SET status=? WHERE id=?').run('paused', campaign.id);
  res.json({ success: true, status: 'paused' });
});

// ── GET /marketing/growth/summary ────────────────────────────────────────────
app.get('/growth/summary', requireAuth, (req: AuthReq, res) => {
  const totalImpressions = (db.prepare('SELECT COALESCE(SUM(impressions),0) as v FROM campaigns WHERE creator_id=?').get(req.userId!) as { v: number }).v;
  const totalClicks = (db.prepare('SELECT COALESCE(SUM(clicks),0) as v FROM campaigns WHERE creator_id=?').get(req.userId!) as { v: number }).v;
  const totalSpent  = (db.prepare('SELECT COALESCE(SUM(spent_gst),0) as v FROM campaigns WHERE creator_id=?').get(req.userId!) as { v: number }).v;
  const referrals   = (db.prepare('SELECT COUNT(*) as v FROM referrals WHERE referrer_id=?').get(req.userId!) as { v: number }).v;
  res.json({ totalImpressions, totalClicks, totalSpent, referrals, ctr: totalImpressions ? (totalClicks / totalImpressions * 100).toFixed(2) : 0 });
});

// ── POST /marketing/referral ──────────────────────────────────────────────────
app.post('/referral', requireAuth, (req: AuthReq, res) => {
  const { referredId } = req.body as { referredId?: string };
  if (!referredId || referredId === req.userId!) { res.status(400).json({ error: 'Invalid referral' }); return; }
  const existing = db.prepare('SELECT id FROM referrals WHERE referred_id=?').get(referredId);
  if (existing) { res.status(409).json({ error: 'User already referred' }); return; }
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO referrals (id,referrer_id,referred_id,created_at) VALUES (?,?,?,?)').run(id, req.userId!, referredId, now);
  redis.publish('marketing:referral', JSON.stringify({ id, referrerId: req.userId!, referredId })).catch(() => null);
  res.status(201).json({ id, rewardGst: 50, status: 'pending' });
});

// ── POST /marketing/ai-recommendations — GhostBrain powered suggestions ───────
app.post('/ai-recommendations', requireAuth, async (req: AuthReq, res) => {
  try {
    const { data } = await axios.post(`${GHOSTBRAIN}/classify`, {
      action:    'marketing_recommendations',
      creatorId: req.userId!,
      context:   req.body,
    }, { timeout: 5000 });
    res.json({ recommendations: data, source: 'ghostbrain' });
  } catch {
    res.json({ recommendations: [], source: 'fallback', message: 'GhostBrain unavailable' });
  }
});

// ── POST /marketing/track — impression/click tracking ────────────────────────
app.post('/track', (req, res) => {
  const { campaignId, type } = req.body as { campaignId?: string; type?: 'impression' | 'click' | 'conversion' };
  if (!campaignId || !['impression', 'click', 'conversion'].includes(type ?? '')) { res.status(400).json({ error: 'campaignId and valid type required' }); return; }
  const col = `${type}s`;
  db.prepare(`UPDATE campaigns SET ${col} = ${col} + 1 WHERE id=?`).run(campaignId);
  res.json({ tracked: true });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Marketing service running on :${PORT}`));
