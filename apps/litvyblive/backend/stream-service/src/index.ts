import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT       = Number(process.env.PORT      ?? 7012);
const JWT_SECRET = process.env.JWT_SECRET       ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR         ?? '/tmp/litvyblive/stream';
const REDIS_URL  = process.env.REDIS_URL        ?? 'redis://localhost:6379';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/stream.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id               TEXT PRIMARY KEY,
    host_id          TEXT NOT NULL,
    title            TEXT DEFAULT '',
    category         TEXT DEFAULT 'general',
    is_live          INTEGER DEFAULT 1,
    is_avatar_mode   INTEGER DEFAULT 0,
    is_pk_active     INTEGER DEFAULT 0,
    opponent_stream  TEXT,
    viewer_count     INTEGER DEFAULT 0,
    peak_viewers     INTEGER DEFAULT 0,
    gift_count       INTEGER DEFAULT 0,
    gift_total_gst   REAL    DEFAULT 0,
    started_at       TEXT NOT NULL,
    ended_at         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_streams_live     ON streams(is_live);
  CREATE INDEX IF NOT EXISTS idx_streams_category ON streams(is_live, category);
  CREATE INDEX IF NOT EXISTS idx_streams_host     ON streams(host_id);
`);

const redis       = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

// ── Auth middleware ───────────────────────────────────────────────────────────
interface AuthReq extends Request { userId?: string }
function requireAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try { req.userId = (jwt.verify(h.slice(7), JWT_SECRET) as { userId: string }).userId; next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*' }, transports: ['websocket'] });

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'stream-service' }));

// ── GET /streams/live ─────────────────────────────────────────────────────────
app.get('/live', (req, res) => {
  const cat = typeof req.query['category'] === 'string' ? req.query['category'] : null;
  const rows = cat
    ? db.prepare('SELECT * FROM streams WHERE is_live=1 AND category=? ORDER BY viewer_count DESC LIMIT 50').all(cat)
    : db.prepare('SELECT * FROM streams WHERE is_live=1 ORDER BY viewer_count DESC LIMIT 50').all();
  res.json(rows);
});

// ── GET /streams/recommended ──────────────────────────────────────────────────
app.get('/recommended', (_req, res) => {
  const rows = db.prepare('SELECT * FROM streams WHERE is_live=1 ORDER BY viewer_count DESC LIMIT 20').all();
  res.json(rows);
});

// ── GET /streams/:id ──────────────────────────────────────────────────────────
app.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM streams WHERE id=?').get(req.params['id']);
  if (!row) { res.status(404).json({ error: 'Stream not found' }); return; }
  res.json(row);
});

// ── POST /streams/start ───────────────────────────────────────────────────────
const startSchema = z.object({
  title:        z.string().max(128).default(''),
  category:     z.string().max(64).default('general'),
  isAvatarMode: z.boolean().default(false),
});

app.post('/start', requireAuth, (req: AuthReq, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { title, category, isAvatarMode } = parsed.data;
  const id = uuid();
  db.prepare(
    'INSERT INTO streams (id,host_id,title,category,is_avatar_mode,started_at) VALUES (?,?,?,?,?,?)',
  ).run(id, req.userId!, title, category, isAvatarMode ? 1 : 0, new Date().toISOString());
  const stream = db.prepare('SELECT * FROM streams WHERE id=?').get(id);
  redis.publish('stream:started', JSON.stringify({ streamId: id, hostId: req.userId!, title, category })).catch(() => null);
  res.status(201).json(stream);
});

// ── POST /streams/:id/end ─────────────────────────────────────────────────────
app.post('/:id/end', requireAuth, (req: AuthReq, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  db.prepare('UPDATE streams SET is_live=0, ended_at=? WHERE id=? AND host_id=?').run(now, id, req.userId!);
  const stream = db.prepare('SELECT * FROM streams WHERE id=?').get(id) as { host_id: string } | undefined;
  io.to(id!).emit('stream_ended', { streamId: id });
  redis.publish('stream:ended', JSON.stringify({ streamId: id, hostId: stream?.host_id })).catch(() => null);
  res.json({ success: true });
});

// ── POST /streams/:id/pk/start ────────────────────────────────────────────────
app.post('/:id/pk/start', requireAuth, (req: AuthReq, res) => {
  const { opponentStreamId } = req.body as { opponentStreamId?: string };
  if (!opponentStreamId) { res.status(400).json({ error: 'opponentStreamId required' }); return; }
  db.prepare('UPDATE streams SET is_pk_active=1, opponent_stream=? WHERE id=?').run(opponentStreamId, req.params['id']);
  io.to(req.params['id']!).emit('pk_start', { streamId: req.params['id'], opponentStreamId });
  io.to(opponentStreamId).emit('pk_start', { streamId: opponentStreamId, opponentStreamId: req.params['id'] });
  res.json({ success: true });
});

// ── POST /streams/:id/pk/end ──────────────────────────────────────────────────
app.post('/:id/pk/end', requireAuth, (req: AuthReq, res) => {
  const { winnerId } = req.body as { winnerId?: string };
  db.prepare('UPDATE streams SET is_pk_active=0, opponent_stream=NULL WHERE id=?').run(req.params['id']);
  io.to(req.params['id']!).emit('pk_end', { streamId: req.params['id'], winnerId });
  res.json({ success: true });
});

// ── Socket.IO — viewer presence ───────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('join_stream', (streamId: string) => {
    socket.join(streamId);
    db.prepare('UPDATE streams SET viewer_count = viewer_count + 1, peak_viewers = MAX(peak_viewers, viewer_count + 1) WHERE id=?').run(streamId);
    const row = db.prepare('SELECT viewer_count FROM streams WHERE id=?').get(streamId) as { viewer_count: number } | undefined;
    io.to(streamId).emit('viewer_update', { count: row?.viewer_count ?? 0 });
  });
  socket.on('leave_stream', (streamId: string) => {
    socket.leave(streamId);
    db.prepare('UPDATE streams SET viewer_count = MAX(0, viewer_count - 1) WHERE id=?').run(streamId);
    const row = db.prepare('SELECT viewer_count FROM streams WHERE id=?').get(streamId) as { viewer_count: number } | undefined;
    io.to(streamId).emit('viewer_update', { count: row?.viewer_count ?? 0 });
  });
  socket.on('disconnect', () => { /* viewer count decremented on leave_stream */ });
});

// ── Track gift totals from gift-service events ────────────────────────────────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
sub.subscribe('gift:sent', () => null);
sub.on('message', (_ch, msg) => {
  try {
    const { streamId, amount } = JSON.parse(msg) as { streamId?: string; amount?: number };
    if (streamId && amount) {
      db.prepare('UPDATE streams SET gift_count = gift_count + 1, gift_total_gst = gift_total_gst + ? WHERE id=?').run(amount, streamId);
    }
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

httpServer.listen(PORT, () => log.info(`Stream service running on :${PORT} (WebSocket enabled)`));
