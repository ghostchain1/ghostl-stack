/**
 * LitVybzLive — Stream Controller
 * REST API for stream lifecycle, viewer tracking, PK battles, and co-host management
 *
 * Port: 3002
 * Storage: SQLite (WAL mode) at /data/stream-controller.db
 *
 * Publishes Redis events:
 *   stream:started, stream:ended, viewer:joined, viewer:left,
 *   pk:battle:started, pk:score:updated, pk:battle:ended,
 *   stream:cohost:added
 */
import express, { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT          ?? '3002', 10);
const REDIS_URL     = process.env.REDIS_URL              ?? 'redis://redis:6379';
const JWT_SECRET    = process.env.JWT_SECRET             ?? 'litvyblive-dev-secret';
const DATA_DIR      = process.env.DATA_DIR               ?? '/data';
const MEDIASOUP_URL = process.env.MEDIASOUP_URL          ?? 'http://mediasoup-server:3000';

mkdirSync(DATA_DIR, { recursive: true });

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'stream-controller.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id            TEXT PRIMARY KEY,
    host_id       TEXT NOT NULL,
    title         TEXT NOT NULL,
    category      TEXT NOT NULL DEFAULT 'general',
    status        TEXT NOT NULL DEFAULT 'live'
                     CHECK(status IN ('live','paused','ended')),
    viewer_count  INTEGER NOT NULL DEFAULT 0,
    peak_viewers  INTEGER NOT NULL DEFAULT 0,
    bitrate_kbps  INTEGER NOT NULL DEFAULT 0,
    mediasoup_node TEXT,
    thumbnail_url TEXT,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    metadata      TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
  CREATE INDEX IF NOT EXISTS idx_streams_host   ON streams(host_id);

  CREATE TABLE IF NOT EXISTS viewer_sessions (
    id         TEXT PRIMARY KEY,
    stream_id  TEXT NOT NULL REFERENCES streams(id),
    user_id    TEXT NOT NULL,
    joined_at  INTEGER NOT NULL,
    left_at    INTEGER,
    region     TEXT DEFAULT 'unknown'
  );

  CREATE INDEX IF NOT EXISTS idx_vs_stream ON viewer_sessions(stream_id, left_at);

  CREATE TABLE IF NOT EXISTS pk_battles (
    id          TEXT PRIMARY KEY,
    stream_a_id TEXT NOT NULL,
    stream_b_id TEXT NOT NULL,
    host_a_id   TEXT NOT NULL,
    host_b_id   TEXT NOT NULL,
    score_a     INTEGER NOT NULL DEFAULT 0,
    score_b     INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'active'
                  CHECK(status IN ('active','ended')),
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    winner_id   TEXT
  );

  CREATE TABLE IF NOT EXISTS co_hosts (
    id           TEXT PRIMARY KEY,
    stream_id    TEXT NOT NULL REFERENCES streams(id),
    user_id      TEXT NOT NULL,
    layout_slot  INTEGER NOT NULL DEFAULT 0,
    joined_at    INTEGER NOT NULL,
    UNIQUE(stream_id, user_id)
  );
`);

// ── Prepared statements ───────────────────────────────────────────────────────
const q = {
  insertStream: db.prepare(
    `INSERT INTO streams (id,host_id,title,category,mediasoup_node,started_at)
     VALUES (@id,@hostId,@title,@category,@node,@now)`),
  getStream:    db.prepare('SELECT * FROM streams WHERE id=?'),
  liveStreams:  db.prepare(`SELECT * FROM streams WHERE status='live'
                            ORDER BY viewer_count DESC LIMIT ?`),
  endStream:    db.prepare(`UPDATE streams SET status='ended',ended_at=? WHERE id=?`),
  pauseStream:  db.prepare(`UPDATE streams SET status='paused' WHERE id=?`),
  resumeStream: db.prepare(`UPDATE streams SET status='live'   WHERE id=?`),
  setViewers:   db.prepare('UPDATE streams SET viewer_count=? WHERE id=?'),
  setPeak:      db.prepare('UPDATE streams SET peak_viewers=? WHERE id=? AND ?> peak_viewers'),
  setBitrate:   db.prepare('UPDATE streams SET bitrate_kbps=? WHERE id=?'),

  insertViewer: db.prepare(
    `INSERT INTO viewer_sessions (id,stream_id,user_id,joined_at,region)
     VALUES (@id,@streamId,@userId,@now,@region)`),
  leaveViewer:  db.prepare(
    `UPDATE viewer_sessions SET left_at=?
     WHERE stream_id=? AND user_id=? AND left_at IS NULL`),
  countViewers: db.prepare(
    `SELECT COUNT(*) as n FROM viewer_sessions WHERE stream_id=? AND left_at IS NULL`),

  insertPk: db.prepare(
    `INSERT INTO pk_battles (id,stream_a_id,stream_b_id,host_a_id,host_b_id,started_at)
     VALUES (@id,@aId,@bId,@aHost,@bHost,@now)`),
  activePk:   db.prepare(
    `SELECT * FROM pk_battles WHERE (stream_a_id=? OR stream_b_id=?) AND status='active'`),
  updatePkScore: db.prepare('UPDATE pk_battles SET score_a=@a,score_b=@b WHERE id=@id'),
  endPk:      db.prepare(
    `UPDATE pk_battles SET status='ended',ended_at=@now,winner_id=@win WHERE id=@id`),

  insertCoHost: db.prepare(
    `INSERT OR IGNORE INTO co_hosts (id,stream_id,user_id,layout_slot,joined_at)
     VALUES (@id,@streamId,@userId,@slot,@now)`),
  removeCoHost: db.prepare('DELETE FROM co_hosts WHERE stream_id=? AND user_id=?'),
  getCoHosts:   db.prepare('SELECT * FROM co_hosts WHERE stream_id=? ORDER BY layout_slot'),
};

// ── App ───────────────────────────────────────────────────────────────────────
const app   = express();
const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => console.warn('[redis] unavailable'));

app.use(express.json());

interface JwtPayload { userId: string; username: string; }

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    (req as Request & { user: JwtPayload }).user =
      jwt.verify(h.slice(7), JWT_SECRET) as JwtPayload;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function getUser(req: Request): JwtPayload {
  return (req as Request & { user: JwtPayload }).user;
}

// ── Helper: sync viewer count ─────────────────────────────────────────────────
function syncViewers(streamId: string): number {
  const { n } = q.countViewers.get(streamId) as { n: number };
  q.setViewers.run(n, streamId);
  q.setPeak.run(n, streamId, n);
  return n;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Streams ───────────────────────────────────────────────────────────────────
const StartSchema = z.object({
  title:    z.string().min(1).max(200),
  category: z.string().default('general'),
  metadata: z.record(z.unknown()).optional(),
});

app.post('/streams', requireAuth, async (req, res) => {
  const user   = getUser(req);
  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { title, category, metadata = {} } = parsed.data;
  const streamId = randomUUID();

  // Resolve mediasoup node
  let node = MEDIASOUP_URL;
  try {
    const { data } = await axios.get(`${MEDIASOUP_URL}/health`, { timeout: 2000 });
    if (data.status === 'ok') node = MEDIASOUP_URL;
  } catch { /* use default */ }

  q.insertStream.run({ id: streamId, hostId: user.userId, title, category, node, now: Date.now() });

  await redis.publish('stream:started', JSON.stringify({
    streamId, hostId: user.userId, title, category, node,
    metadata: JSON.stringify(metadata),
  }));

  res.status(201).json({ streamId, title, category, hostId: user.userId, status: 'live' });
});

app.get('/streams', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10), 200);
  const rows   = q.liveStreams.all(limit) as Record<string, unknown>[];
  res.json(rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata as string ?? '{}') })));
});

app.get('/streams/:id', (req, res) => {
  const stream = q.getStream.get(req.params.id) as Record<string, unknown> | undefined;
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  const coHosts = q.getCoHosts.all(req.params.id);
  const pk      = q.activePk.get(req.params.id, req.params.id);
  res.json({ ...stream, metadata: JSON.parse(stream.metadata as string ?? '{}'), coHosts, pk: pk ?? null });
});

app.delete('/streams/:id', requireAuth, async (req, res) => {
  const user   = getUser(req);
  const stream = q.getStream.get(req.params.id) as Record<string, unknown> | undefined;
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  if (stream.host_id !== user.userId) return res.status(403).json({ error: 'Forbidden' });

  q.endStream.run(Date.now(), req.params.id);

  // Close mediasoup room
  axios.delete(`${MEDIASOUP_URL}/rooms/${req.params.id}`).catch(() => {});

  await redis.publish('stream:ended', JSON.stringify({
    streamId:    req.params.id,
    hostId:      user.userId,
    viewerCount: stream.viewer_count,
    peakViewers: stream.peak_viewers,
    durationMs:  Date.now() - (stream.started_at as number),
  }));

  res.json({ ended: true });
});

app.patch('/streams/:id/pause', requireAuth, (req, res) => {
  const s = q.getStream.get(req.params.id) as Record<string, unknown> | undefined;
  if (!s) return res.status(404).json({ error: 'not found' });
  if (s.host_id !== getUser(req).userId) return res.status(403).json({ error: 'forbidden' });
  q.pauseStream.run(req.params.id);
  res.json({ paused: true });
});

app.patch('/streams/:id/resume', requireAuth, (req, res) => {
  const s = q.getStream.get(req.params.id) as Record<string, unknown> | undefined;
  if (!s) return res.status(404).json({ error: 'not found' });
  if (s.host_id !== getUser(req).userId) return res.status(403).json({ error: 'forbidden' });
  q.resumeStream.run(req.params.id);
  res.json({ resumed: true });
});

app.post('/streams/:id/bitrate', (req, res) => {
  const { kbps } = req.body as { kbps: number };
  q.setBitrate.run(kbps, req.params.id);
  res.json({ updated: true });
});

// ── Viewers ───────────────────────────────────────────────────────────────────
app.post('/streams/:id/viewers', requireAuth, async (req, res) => {
  const user   = getUser(req);
  const stream = q.getStream.get(req.params.id) as Record<string, unknown> | undefined;
  if (!stream || stream.status !== 'live') return res.status(404).json({ error: 'Stream not live' });

  q.insertViewer.run({
    id:       randomUUID(),
    streamId: req.params.id,
    userId:   user.userId,
    now:      Date.now(),
    region:   (req.body as { region?: string }).region ?? 'unknown',
  });

  const count = syncViewers(req.params.id);

  await redis.publish('viewer:joined', JSON.stringify({
    streamId: req.params.id, userId: user.userId, viewerCount: count,
  }));

  res.json({ joined: true, viewerCount: count });
});

app.delete('/streams/:id/viewers/:userId', async (req, res) => {
  q.leaveViewer.run(Date.now(), req.params.id, req.params.userId);
  const count = syncViewers(req.params.id);
  await redis.publish('viewer:left', JSON.stringify({
    streamId: req.params.id, userId: req.params.userId, viewerCount: count,
  })).catch(() => {});
  res.json({ left: true, viewerCount: count });
});

// ── Co-hosts ──────────────────────────────────────────────────────────────────
app.post('/streams/:id/cohosts', requireAuth, (req, res) => {
  const user   = getUser(req);
  const stream = q.getStream.get(req.params.id) as Record<string, unknown> | undefined;
  if (!stream || stream.host_id !== user.userId) return res.status(403).json({ error: 'Forbidden' });

  const { userId, slot = 0 } = req.body as { userId: string; slot?: number };
  q.insertCoHost.run({ id: randomUUID(), streamId: req.params.id, userId, slot, now: Date.now() });
  redis.publish('stream:cohost:added', JSON.stringify({ streamId: req.params.id, userId, slot })).catch(() => {});
  res.json({ added: true });
});

app.delete('/streams/:id/cohosts/:userId', requireAuth, (req, res) => {
  q.removeCoHost.run(req.params.id, req.params.userId);
  res.json({ removed: true });
});

// ── PK Battles ────────────────────────────────────────────────────────────────
const PKSchema = z.object({
  streamBId: z.string().uuid(),
  hostBId:   z.string().min(1),
});

app.post('/streams/:id/pk', requireAuth, async (req, res) => {
  const user   = getUser(req);
  const stream = q.getStream.get(req.params.id) as Record<string, unknown> | undefined;
  if (!stream || stream.host_id !== user.userId) return res.status(403).json({ error: 'Forbidden' });

  const parsed = PKSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { streamBId, hostBId } = parsed.data;
  const pkId = randomUUID();

  q.insertPk.run({ id: pkId, aId: req.params.id, bId: streamBId,
                   aHost: user.userId, bHost: hostBId, now: Date.now() });

  await redis.publish('pk:battle:started', JSON.stringify({
    pkId, streamAId: req.params.id, streamBId, hostAId: user.userId, hostBId,
  }));

  res.status(201).json({ pkId, status: 'active' });
});

app.get('/streams/:id/pk', (req, res) => {
  const pk = q.activePk.get(req.params.id, req.params.id);
  if (!pk) return res.status(404).json({ error: 'No active PK battle' });
  res.json(pk);
});

app.post('/pk/:pkId/score', async (req, res) => {
  const pk = db.prepare('SELECT * FROM pk_battles WHERE id=?').get(req.params.pkId) as Record<string, unknown> | undefined;
  if (!pk) return res.status(404).json({ error: 'PK not found' });

  const { scoreA, scoreB } = req.body as { scoreA: number; scoreB: number };
  q.updatePkScore.run({ a: scoreA, b: scoreB, id: req.params.pkId });

  await redis.publish('pk:score:updated', JSON.stringify({
    pkId: req.params.pkId, scoreA, scoreB,
  })).catch(() => {});

  res.json({ updated: true });
});

app.post('/pk/:pkId/end', requireAuth, async (req, res) => {
  const pk = db.prepare('SELECT * FROM pk_battles WHERE id=?').get(req.params.pkId) as Record<string, unknown> | undefined;
  if (!pk) return res.status(404).json({ error: 'PK not found' });

  const winnerId = (pk.score_a as number) >= (pk.score_b as number)
    ? pk.host_a_id : pk.host_b_id;
  q.endPk.run({ now: Date.now(), win: winnerId, id: req.params.pkId });

  await redis.publish('pk:battle:ended', JSON.stringify({
    pkId: req.params.pkId, winnerId, scoreA: pk.score_a, scoreB: pk.score_b,
  }));

  res.json({ ended: true, winnerId });
});

// ── Periodic viewer-count reconciliation ─────────────────────────────────────
setInterval(() => {
  const live = db.prepare(`SELECT id FROM streams WHERE status='live'`).all() as Array<{ id: string }>;
  for (const { id } of live) syncViewers(id);
}, 15_000);

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`stream-controller :${PORT}`));
