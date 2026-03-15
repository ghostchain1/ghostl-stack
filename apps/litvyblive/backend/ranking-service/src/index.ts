import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT       = Number(process.env.PORT       ?? 7019);
const JWT_SECRET = process.env.JWT_SECRET        ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR          ?? '/tmp/litvyblive/ranking';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://localhost:6379';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/ranking.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id          TEXT NOT NULL,
    scope       TEXT NOT NULL,
    period      TEXT NOT NULL,
    score       REAL DEFAULT 0,
    metadata    TEXT DEFAULT '{}',
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (id, scope, period)
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    scope      TEXT NOT NULL,
    period     TEXT NOT NULL,
    rank       INTEGER NOT NULL,
    entity_id  TEXT NOT NULL,
    score      REAL NOT NULL,
    snapshot_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_scope ON scores(scope, period, score DESC);
`);

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

/** ISO week string, e.g. "2025-W23" */
function currentWeek(): string {
  const d  = new Date();
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + 4 - day);
  const y  = d.getFullYear();
  const w  = Math.ceil(((d.getTime() - new Date(y, 0, 1).getTime()) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bumpScore(id: string, scope: string, amount: number, metadata: Record<string, unknown> = {}): void {
  const now    = new Date().toISOString();
  const week   = currentWeek();
  const month  = currentMonth();
  const global = 'all-time';
  for (const period of [week, month, global]) {
    db.prepare(`
      INSERT INTO scores (id, scope, period, score, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, scope, period) DO UPDATE SET
        score = score + excluded.score,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `).run(id, scope, period, amount, JSON.stringify(metadata), now);
  }
}

interface AuthReq extends Request { userId?: string }
function requireAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try { req.userId = (jwt.verify(h.slice(7), JWT_SECRET) as { userId: string }).userId; next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function getRanking(scope: string, period: string, limit = 50): Array<Record<string, unknown>> {
  return db.prepare(`
    SELECT id as entity_id, score, metadata, updated_at,
           ROW_NUMBER() OVER (ORDER BY score DESC) as rank
    FROM scores WHERE scope=? AND period=?
    ORDER BY score DESC LIMIT ?
  `).all(scope, period, limit) as Array<Record<string, unknown>>;
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ranking-service' }));

// ── GET /rankings/hosts ───────────────────────────────────────────────────────
app.get('/hosts', (_req, res) => {
  const period = (_req.query['period'] as string) ?? currentWeek();
  const limit  = Math.min(Number(_req.query['limit'] ?? 50), 200);
  res.json({ scope: 'hosts', period, rankings: getRanking('hosts', period, limit) });
});

// ── GET /rankings/gifters ─────────────────────────────────────────────────────
app.get('/gifters', (_req, res) => {
  const period = (_req.query['period'] as string) ?? currentWeek();
  const limit  = Math.min(Number(_req.query['limit'] ?? 50), 200);
  res.json({ scope: 'gifters', period, rankings: getRanking('gifters', period, limit) });
});

// ── GET /rankings/receivers ───────────────────────────────────────────────────
app.get('/receivers', (_req, res) => {
  const period = (_req.query['period'] as string) ?? currentWeek();
  const limit  = Math.min(Number(_req.query['limit'] ?? 50), 200);
  res.json({ scope: 'receivers', period, rankings: getRanking('receivers', period, limit) });
});

// ── GET /rankings/agencies ────────────────────────────────────────────────────
app.get('/agencies', (_req, res) => {
  const period = (_req.query['period'] as string) ?? currentMonth();
  const limit  = Math.min(Number(_req.query['limit'] ?? 50), 200);
  res.json({ scope: 'agencies', period, rankings: getRanking('agencies', period, limit) });
});

// ── GET /rankings/weekly ──────────────────────────────────────────────────────
app.get('/weekly', (_req, res) => {
  const period = currentWeek();
  res.json({
    period,
    hosts:     getRanking('hosts',     period, 10),
    gifters:   getRanking('gifters',   period, 10),
    receivers: getRanking('receivers', period, 10),
  });
});

// ── GET /rankings/user/:userId ────────────────────────────────────────────────
app.get('/user/:userId', (req, res) => {
  const period = (req.query['period'] as string) ?? currentWeek();
  const userId = req.params['userId'];
  const rows   = db.prepare(`
    SELECT scope, score,
           (SELECT COUNT(*)+1 FROM scores s2 WHERE s2.scope=s.scope AND s2.period=s.period AND s2.score > s.score) as rank
    FROM scores s WHERE id=? AND period=?
  `).all(userId, period);
  res.json({ userId, period, rankings: rows });
});

// ── POST /rankings/update (internal — called by other services) ───────────────
app.post('/update', requireAuth, (req: AuthReq, res) => {
  const { id, scope, amount, metadata } = req.body as {
    id?: string; scope?: 'hosts' | 'gifters' | 'receivers' | 'agencies'; amount?: number; metadata?: Record<string, unknown>;
  };
  if (!id || !scope || !amount) { res.status(400).json({ error: 'id, scope, amount required' }); return; }
  const ALLOWED_SCOPES = ['hosts', 'gifters', 'receivers', 'agencies'];
  if (!ALLOWED_SCOPES.includes(scope)) { res.status(400).json({ error: 'Invalid scope' }); return; }
  bumpScore(id, scope, amount, metadata);
  res.json({ success: true });
});

// ── Redis subscriptions — auto-update from events ─────────────────────────────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
sub.subscribe('gift:sent', 'stream:ended', () => null);
sub.on('message', (_ch, msg) => {
  try {
    const ev = JSON.parse(msg) as {
      type?: string; senderId?: string; creatorId?: string; amount?: number;
      agencyId?: string; viewerCount?: number; hostId?: string;
    };
    if (_ch === 'gift:sent') {
      if (ev.senderId  && ev.amount) bumpScore(ev.senderId,  'gifters',   ev.amount);
      if (ev.creatorId && ev.amount) bumpScore(ev.creatorId, 'receivers', ev.amount);
      if (ev.agencyId  && ev.amount) bumpScore(ev.agencyId,  'agencies',  ev.amount * 0.15);
    }
    if (_ch === 'stream:ended') {
      if (ev.hostId && ev.viewerCount) bumpScore(ev.hostId, 'hosts', ev.viewerCount);
    }
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Ranking service running on :${PORT}`));
