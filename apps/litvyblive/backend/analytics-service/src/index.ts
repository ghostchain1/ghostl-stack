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

const PORT       = Number(process.env.PORT       ?? 7025);
const JWT_SECRET = process.env.JWT_SECRET        ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR          ?? '/tmp/litvyblive/analytics';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://localhost:6379';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/analytics.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS events_log (
    id          TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    user_id     TEXT,
    stream_id   TEXT,
    amount      REAL,
    metadata    TEXT DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stream_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_id    TEXT NOT NULL,
    viewer_count INTEGER DEFAULT 0,
    gift_count   INTEGER DEFAULT 0,
    gift_total   REAL DEFAULT 0,
    snapshot_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_rollup (
    date        TEXT NOT NULL,
    metric      TEXT NOT NULL,
    value       REAL NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (date, metric)
  );
  CREATE INDEX IF NOT EXISTS idx_events_type ON events_log(event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_user ON events_log(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_stream ON events_log(stream_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_snaps_stream ON stream_snapshots(stream_id, snapshot_at);
`);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function ingestEvent(eventType: string, userId?: string, streamId?: string, amount?: number, metadata: Record<string, unknown> = {}): void {
  db.prepare('INSERT INTO events_log (id,event_type,user_id,stream_id,amount,metadata,created_at) VALUES (?,?,?,?,?,?,?)').run(uuid(), eventType, userId ?? null, streamId ?? null, amount ?? null, JSON.stringify(metadata), new Date().toISOString());
}

function bumpDailyMetric(metric: string, delta: number): void {
  const today = todayStr();
  db.prepare(`
    INSERT INTO daily_rollup (date, metric, value, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(date, metric) DO UPDATE SET value = value + excluded.value, updated_at = excluded.updated_at
  `).run(today, metric, delta, new Date().toISOString());
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

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '512kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'analytics-service' }));

// ── POST /analytics/events — ingest an event ─────────────────────────────────
const eventSchema = z.object({
  eventType: z.string().min(1).max(100),
  userId:    z.string().optional(),
  streamId:  z.string().optional(),
  amount:    z.number().optional(),
  metadata:  z.record(z.unknown()).optional(),
});

app.post('/events', (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  ingestEvent(parsed.data.eventType, parsed.data.userId, parsed.data.streamId, parsed.data.amount, parsed.data.metadata);
  bumpDailyMetric(`event:${parsed.data.eventType}`, 1);
  res.status(201).json({ received: true });
});

// ── POST /analytics/events/batch — batch ingest ───────────────────────────────
const batchSchema = z.object({
  events: z.array(eventSchema).max(100),
});

app.post('/events/batch', (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const insert = db.prepare('INSERT INTO events_log (id,event_type,user_id,stream_id,amount,metadata,created_at) VALUES (?,?,?,?,?,?,?)');
  db.transaction(() => {
    for (const ev of parsed.data.events) {
      insert.run(uuid(), ev.eventType, ev.userId ?? null, ev.streamId ?? null, ev.amount ?? null, JSON.stringify(ev.metadata ?? {}), new Date().toISOString());
    }
  })();
  res.status(201).json({ received: parsed.data.events.length });
});

// ── GET /analytics/streams/:id — stream analytics sumary ─────────────────────
app.get('/streams/:id', requireAuth, (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const fromDate = from ?? new Date(Date.now() - 7 * 86400_000).toISOString();
  const toDate   = to   ?? new Date().toISOString();

  const giftTotal = (db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
    FROM events_log WHERE stream_id=? AND event_type='gift:sent' AND created_at BETWEEN ? AND ?
  `).get(req.params['id'], fromDate, toDate) as { total: number; cnt: number });

  const peakViewers = (db.prepare(`
    SELECT COALESCE(MAX(viewer_count),0) as peak FROM stream_snapshots
    WHERE stream_id=? AND snapshot_at BETWEEN ? AND ?
  `).get(req.params['id'], fromDate, toDate) as { peak: number });

  const chatCount = (db.prepare(`
    SELECT COUNT(*) as cnt FROM events_log WHERE stream_id=? AND event_type='chat:message' AND created_at BETWEEN ? AND ?
  `).get(req.params['id'], fromDate, toDate) as { cnt: number });

  res.json({
    streamId:    req.params['id'],
    period:      { from: fromDate, to: toDate },
    totalGiftGst: giftTotal.total,
    giftCount:   giftTotal.cnt,
    peakViewers: peakViewers.peak,
    chatMessages: chatCount.cnt,
  });
});

// ── GET /analytics/platform/summary ──────────────────────────────────────────
app.get('/platform/summary', requireAuth, (_req, res) => {
  const today   = todayStr();
  const metrics = db.prepare('SELECT metric, value FROM daily_rollup WHERE date=?').all(today) as { metric: string; value: number }[];
  const rollup  = Object.fromEntries(metrics.map((m) => [m.metric, m.value]));

  const activeUsers  = (db.prepare(`SELECT COUNT(DISTINCT user_id) as cnt FROM events_log WHERE created_at > date('now','-1 day')`).get() as { cnt: number }).cnt;
  const totalEvents  = (db.prepare(`SELECT COUNT(*) as cnt FROM events_log WHERE created_at > date('now','-1 day')`).get() as { cnt: number }).cnt;
  const totalGifts   = (db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM events_log WHERE event_type='gift:sent' AND created_at > date('now','-1 day')`).get() as { v: number }).v;

  res.json({ date: today, activeUsers24h: activeUsers, totalEvents24h: totalEvents, totalGiftGst24h: totalGifts, dailyRollup: rollup });
});

// ── GET /analytics/creator/:userId — creator-specific insights ────────────────
app.get('/creator/:userId', requireAuth, (req, res) => {
  const userId    = req.params['userId'];
  const giftRecv  = (db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM events_log WHERE user_id=? AND event_type='gift:received'`).get(userId) as { v: number }).v;
  const streams   = (db.prepare(`SELECT COUNT(*) as cnt FROM events_log WHERE user_id=? AND event_type='stream:started'`).get(userId) as { cnt: number }).cnt;
  const followers = (db.prepare(`SELECT COUNT(*) as cnt FROM events_log WHERE event_type='user:followed' AND metadata LIKE ?`).get(`%"followeeId":"${userId}"%`) as { cnt: number }).cnt;

  res.json({ userId, totalGstReceived: giftRecv, streamsStarted: streams, estimatedFollowers: followers });
});

// ── GET /analytics/top-streams — top streams by gifts today ──────────────────
app.get('/top-streams', (_req, res) => {
  const rows = db.prepare(`
    SELECT stream_id, COALESCE(SUM(amount),0) as gift_total, COUNT(*) as gift_count
    FROM events_log
    WHERE event_type='gift:sent' AND created_at > date('now','-1 day') AND stream_id IS NOT NULL
    GROUP BY stream_id ORDER BY gift_total DESC LIMIT 20
  `).all();
  res.json(rows);
});

// ── GET /analytics/trend — hourly event counts ────────────────────────────────
app.get('/trend', requireAuth, (req, res) => {
  const eventType = (req.query['type'] as string) ?? 'gift:sent';
  const hours     = Math.min(Number(req.query['hours'] ?? 24), 168);
  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%dT%H:00:00Z', created_at) as hour, COUNT(*) as count
    FROM events_log
    WHERE event_type=? AND created_at > datetime('now', ? || ' hours')
    GROUP BY hour ORDER BY hour ASC
  `).all(eventType, `-${hours}`);
  res.json({ eventType, hours, trend: rows });
});

// ── Redis: auto-ingest all bus events ─────────────────────────────────────────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
const TRACKED_EVENTS = ['gift:sent', 'stream:started', 'stream:ended', 'user:followed', 'auth:user:created', 'game:played', 'pk:battle:started'];
sub.subscribe(...TRACKED_EVENTS, () => null);
sub.on('message', (ch, msg) => {
  try {
    const ev = JSON.parse(msg) as {
      senderId?: string; creatorId?: string; amount?: number;
      stream_id?: string; streamId?: string; hostId?: string; userId?: string;
    };
    ingestEvent(ch, ev.senderId ?? ev.userId ?? ev.hostId, ev.stream_id ?? ev.streamId, ev.amount);
    bumpDailyMetric(`event:${ch}`, 1);
    if (ch === 'gift:sent' && ev.amount) bumpDailyMetric('total_gst_gifts', ev.amount);
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Analytics service running on :${PORT}`));
