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

const PORT       = Number(process.env.PORT       ?? 7024);
const JWT_SECRET = process.env.JWT_SECRET        ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR          ?? '/tmp/litvyblive/fraud';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://localhost:6379';

// Risk thresholds
const HIGH_RISK_THRESHOLD   = 70;
const MEDIUM_RISK_THRESHOLD = 40;

// Rate windows (rolling, via Redis counters)
const GIFT_RATE_WINDOW_SEC  = 60;
const GIFT_RATE_LIMIT       = 20;  // max gifts per user per minute before flagging

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/fraud.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS risk_scores (
    user_id     TEXT PRIMARY KEY,
    score       INTEGER DEFAULT 0,
    flags       TEXT DEFAULT '[]',
    is_banned   INTEGER DEFAULT 0,
    last_check  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL,
    severity    TEXT NOT NULL,
    details     TEXT DEFAULT '{}',
    resolved    INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rate_violations (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL,
    count       INTEGER NOT NULL,
    window_sec  INTEGER NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, resolved, created_at);
  CREATE INDEX IF NOT EXISTS idx_alerts_sev ON alerts(severity, resolved);
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

function ensureRisk(userId: string): void {
  if (!db.prepare('SELECT user_id FROM risk_scores WHERE user_id=?').get(userId)) {
    db.prepare('INSERT OR IGNORE INTO risk_scores (user_id, last_check) VALUES (?,?)').run(userId, new Date().toISOString());
  }
}

function addFlag(userId: string, flag: string): void {
  const row = db.prepare('SELECT flags, score FROM risk_scores WHERE user_id=?').get(userId) as { flags: string; score: number } | undefined;
  if (!row) return;
  const flags = JSON.parse(row.flags) as string[];
  if (!flags.includes(flag)) flags.push(flag);
  const newScore = Math.min(row.score + 15, 100);
  db.prepare('UPDATE risk_scores SET flags=?, score=?, last_check=? WHERE user_id=?').run(JSON.stringify(flags), newScore, new Date().toISOString(), userId);
}

function createAlert(userId: string, type: string, severity: 'low' | 'medium' | 'high' | 'critical', details: Record<string, unknown>): void {
  db.prepare('INSERT INTO alerts (id,user_id,type,severity,details,created_at) VALUES (?,?,?,?,?,?)').run(uuid(), userId, type, severity, JSON.stringify(details), new Date().toISOString());
}

async function checkGiftRate(userId: string): Promise<{ rateExceeded: boolean; count: number }> {
  const key   = `fraud:gift_rate:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, GIFT_RATE_WINDOW_SEC);
  return { rateExceeded: count > GIFT_RATE_LIMIT, count };
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'fraud-service' }));

// ── POST /fraud/check/user ────────────────────────────────────────────────────
const userCheckSchema = z.object({
  userId:     z.string(),
  action:     z.string().optional(),
  context:    z.record(z.unknown()).optional(),
});

app.post('/check/user', requireAuth, (req: AuthReq, res) => {
  const parsed = userCheckSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { userId, action } = parsed.data;
  ensureRisk(userId);
  const risk = db.prepare('SELECT * FROM risk_scores WHERE user_id=?').get(userId) as {
    score: number; flags: string; is_banned: number;
  } | undefined;

  const score   = risk?.score ?? 0;
  const flags   = risk ? JSON.parse(risk.flags) as string[] : [];
  const isBanned = risk?.is_banned === 1;
  const severity = score >= HIGH_RISK_THRESHOLD ? 'high' : score >= MEDIUM_RISK_THRESHOLD ? 'medium' : 'low';

  res.json({ userId, riskScore: score, severity, flags, isBanned, action, allowed: !isBanned && score < HIGH_RISK_THRESHOLD });
});

// ── POST /fraud/check/gift ────────────────────────────────────────────────────
const giftCheckSchema = z.object({
  senderId:   z.string(),
  receiverId: z.string(),
  amount:     z.number().positive(),
  giftKey:    z.string(),
});

app.post('/check/gift', requireAuth, async (req: AuthReq, res) => {
  const parsed = giftCheckSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { senderId, receiverId, amount } = parsed.data;

  ensureRisk(senderId);

  const alerts: string[] = [];

  // Check gift rate
  const { rateExceeded, count } = await checkGiftRate(senderId);
  if (rateExceeded) {
    addFlag(senderId, 'gift_rate_exceeded');
    createAlert(senderId, 'gift_rate_exceeded', 'high', { count, window: GIFT_RATE_WINDOW_SEC, amount });
    alerts.push('Gift rate limit exceeded — possible bot activity');
  }

  // Flag if same sender/receiver pair is repeated > 5 per minute (self-gifting pattern)
  const selfGiftKey = `fraud:self_gift:${senderId}:${receiverId}`;
  const selfCount   = await redis.incr(selfGiftKey);
  if (selfCount === 1) await redis.expire(selfGiftKey, 60);
  if (selfCount > 5) {
    addFlag(senderId, 'repeated_pair_gifting');
    createAlert(senderId, 'repeated_pair_gifting', 'medium', { receiverId, count: selfCount, amount });
    alerts.push('Repeated gifting to same creator — watch-list added');
  }

  // High-value single gift spike
  if (amount > 5000) {
    addFlag(senderId, 'high_value_gift');
    createAlert(senderId, 'high_value_gift', 'medium', { amount, receiverId });
    alerts.push('High-value gift flagged for review');
  }

  const risk = db.prepare('SELECT score, is_banned FROM risk_scores WHERE user_id=?').get(senderId) as { score: number; is_banned: number } | undefined;
  const blocked = risk?.is_banned === 1;

  res.json({ allowed: !blocked, alerts, riskScore: risk?.score ?? 0, senderId, amount });
});

// ── GET /fraud/alerts ─────────────────────────────────────────────────────────
app.get('/alerts', requireAuth, (req: AuthReq, res) => {
  const severity = req.query['severity'] as string | undefined;
  const resolved = req.query['resolved'] === 'true' ? 1 : 0;
  const limit    = Math.min(Number(req.query['limit'] ?? 100), 500);
  const rows = severity
    ? db.prepare('SELECT * FROM alerts WHERE severity=? AND resolved=? ORDER BY created_at DESC LIMIT ?').all(severity, resolved, limit)
    : db.prepare('SELECT * FROM alerts WHERE resolved=? ORDER BY created_at DESC LIMIT ?').all(resolved, limit);
  res.json(rows);
});

// ── POST /fraud/alerts/:id/resolve ────────────────────────────────────────────
app.post('/alerts/:id/resolve', requireAuth, (req: AuthReq, res) => {
  db.prepare('UPDATE alerts SET resolved=1 WHERE id=?').run(req.params['id']);
  res.json({ success: true });
});

// ── GET /fraud/risk/:userId ───────────────────────────────────────────────────
app.get('/risk/:userId', requireAuth, (req, res) => {
  ensureRisk(req.params['userId']);
  const row = db.prepare('SELECT * FROM risk_scores WHERE user_id=?').get(req.params['userId']);
  res.json(row ?? null);
});

// ── POST /fraud/ban/:userId ───────────────────────────────────────────────────
app.post('/ban/:userId', requireAuth, (req, res) => {
  ensureRisk(req.params['userId']);
  db.prepare('UPDATE risk_scores SET is_banned=1, score=100, last_check=? WHERE user_id=?').run(new Date().toISOString(), req.params['userId']);
  redis.publish('fraud:user:banned', JSON.stringify({ userId: req.params['userId'] })).catch(() => null);
  res.json({ success: true, banned: true });
});

// ── Redis: monitor gift:sent for automated fraud checks ───────────────────────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
sub.subscribe('gift:sent', () => null);
sub.on('message', (_ch, msg) => {
  try {
    const { senderId, amount } = JSON.parse(msg) as { senderId?: string; amount?: number };
    if (!senderId) return;
    ensureRisk(senderId);

    // Async rate check (fire and forget — don't block event processing)
    checkGiftRate(senderId).then(({ rateExceeded, count }) => {
      if (rateExceeded) {
        addFlag(senderId, 'gift_rate_exceeded');
        createAlert(senderId, 'gift_rate_exceeded', 'high', { count, amount });
        log.warn('Auto-flagged: gift rate exceeded', { senderId, count });
      }
    }).catch(() => null);
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Fraud service running on :${PORT}`));
