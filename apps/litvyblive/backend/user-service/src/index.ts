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

const PORT       = Number(process.env.PORT      ?? 7011);
const JWT_SECRET = process.env.JWT_SECRET       ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR         ?? '/tmp/litvyblive/user';
const REDIS_URL  = process.env.REDIS_URL        ?? 'redis://localhost:6379';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/user.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    user_id      TEXT PRIMARY KEY,
    display_name TEXT,
    bio          TEXT DEFAULT '',
    avatar_url   TEXT DEFAULT '',
    banner_url   TEXT DEFAULT '',
    creator_level INTEGER DEFAULT 1,
    total_gifted REAL DEFAULT 0,
    total_earned REAL DEFAULT 0,
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    stream_count INTEGER DEFAULT 0,
    reputation   INTEGER DEFAULT 100,
    is_verified  INTEGER DEFAULT 0,
    updated_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id  TEXT NOT NULL,
    followee_id  TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
`);

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

// ── Auth middleware ───────────────────────────────────────────────────────────
interface AuthReq extends Request { userId?: string }

function requireAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const p = jwt.verify(h.slice(7), JWT_SECRET) as { userId: string };
    req.userId = p.userId;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureProfile(userId: string): void {
  const exists = db.prepare('SELECT user_id FROM profiles WHERE user_id=?').get(userId);
  if (!exists) {
    db.prepare(
      'INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)',
    ).run(userId, new Date().toISOString());
  }
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '128kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'user-service' }));

// ── GET /me ───────────────────────────────────────────────────────────────────
app.get('/me', requireAuth, (req: AuthReq, res) => {
  ensureProfile(req.userId!);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(req.userId!);
  res.json(profile);
});

// ── GET /users/:id ────────────────────────────────────────────────────────────
app.get('/:id', (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(req.params['id']);
  if (!profile) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(profile);
});

// ── PUT /users/me (update profile) ───────────────────────────────────────────
const updateSchema = z.object({
  display_name: z.string().max(50).optional(),
  bio:          z.string().max(200).optional(),
  avatar_url:   z.string().url().max(512).optional(),
  banner_url:   z.string().url().max(512).optional(),
});

app.put('/me', requireAuth, (req: AuthReq, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  ensureProfile(req.userId!);
  const { display_name, bio, avatar_url, banner_url } = parsed.data;
  db.prepare(
    `UPDATE profiles SET
       display_name = COALESCE(?, display_name),
       bio          = COALESCE(?, bio),
       avatar_url   = COALESCE(?, avatar_url),
       banner_url   = COALESCE(?, banner_url),
       updated_at   = ?
     WHERE user_id = ?`,
  ).run(display_name ?? null, bio ?? null, avatar_url ?? null, banner_url ?? null, new Date().toISOString(), req.userId!);
  res.json({ success: true });
});

// ── POST /users/:id/follow ────────────────────────────────────────────────────
app.post('/:id/follow', requireAuth, (req: AuthReq, res) => {
  const followeeId = req.params['id'];
  if (followeeId === req.userId) { res.status(400).json({ error: 'Cannot follow yourself' }); return; }
  const existing = db.prepare(
    'SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?',
  ).get(req.userId!, followeeId);
  if (existing) { res.status(409).json({ error: 'Already following' }); return; }

  db.transaction(() => {
    db.prepare('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)').run(
      req.userId!, followeeId, new Date().toISOString(),
    );
    db.prepare('UPDATE profiles SET follower_count  = follower_count  + 1, updated_at=? WHERE user_id=?').run(new Date().toISOString(), followeeId);
    db.prepare('UPDATE profiles SET following_count = following_count + 1, updated_at=? WHERE user_id=?').run(new Date().toISOString(), req.userId!);
  })();

  redis.publish('user:followed', JSON.stringify({ followerId: req.userId, followeeId })).catch(() => null);
  res.json({ success: true });
});

// ── DELETE /users/:id/follow (unfollow) ───────────────────────────────────────
app.delete('/:id/follow', requireAuth, (req: AuthReq, res) => {
  const followeeId = req.params['id'];
  db.transaction(() => {
    const r = db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(req.userId!, followeeId);
    if (r.changes > 0) {
      db.prepare('UPDATE profiles SET follower_count  = MAX(0, follower_count  - 1), updated_at=? WHERE user_id=?').run(new Date().toISOString(), followeeId);
      db.prepare('UPDATE profiles SET following_count = MAX(0, following_count - 1), updated_at=? WHERE user_id=?').run(new Date().toISOString(), req.userId!);
    }
  })();
  res.json({ success: true });
});

// ── GET /users/:id/followers ──────────────────────────────────────────────────
app.get('/:id/followers', (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare(
    'SELECT follower_id, created_at FROM follows WHERE followee_id=? ORDER BY created_at DESC LIMIT ?',
  ).all(req.params['id'], limit);
  res.json(rows);
});

// ── GET /users/:id/following ──────────────────────────────────────────────────
app.get('/:id/following', (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare(
    'SELECT followee_id, created_at FROM follows WHERE follower_id=? ORDER BY created_at DESC LIMIT ?',
  ).all(req.params['id'], limit);
  res.json(rows);
});

// ── GET /users/search ─────────────────────────────────────────────────────────
app.get('/search', (req, res) => {
  const q = typeof req.query['q'] === 'string' ? `%${req.query['q']}%` : '%';
  const rows = db.prepare(
    'SELECT user_id, display_name, avatar_url, creator_level, follower_count, is_verified FROM profiles WHERE display_name LIKE ? LIMIT 30',
  ).all(q);
  res.json(rows);
});

// ── Internals: bump stats (called by gift/stream services via Redis sub) ───────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
sub.subscribe('gift:sent', 'stream:ended', () => null);
sub.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message) as { creatorId?: string; senderId?: string; amount?: number; streams?: number };
    if (channel === 'gift:sent' && data.creatorId) {
      db.prepare('UPDATE profiles SET total_earned = total_earned + ?, updated_at=? WHERE user_id=?').run(data.amount ?? 0, new Date().toISOString(), data.creatorId);
      if (data.senderId) db.prepare('UPDATE profiles SET total_gifted = total_gifted + ?, updated_at=? WHERE user_id=?').run(data.amount ?? 0, new Date().toISOString(), data.senderId);
    }
    if (channel === 'stream:ended' && data.creatorId) {
      db.prepare('UPDATE profiles SET stream_count = stream_count + 1, updated_at=? WHERE user_id=?').run(new Date().toISOString(), data.creatorId);
    }
  } catch { /* ignore malformed events */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`User service running on :${PORT}`));
