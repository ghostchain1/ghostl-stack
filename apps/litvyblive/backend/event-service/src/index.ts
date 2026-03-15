import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT       = Number(process.env.PORT       ?? 7020);
const JWT_SECRET = process.env.JWT_SECRET        ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR          ?? '/tmp/litvyblive/events';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://localhost:6379';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/events.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT DEFAULT '',
    host_id       TEXT NOT NULL,
    prize_pool    REAL DEFAULT 0,
    entry_fee     REAL DEFAULT 0,
    max_entrants  INTEGER DEFAULT 100,
    status        TEXT DEFAULT 'upcoming',
    start_at      TEXT,
    end_at        TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS participants (
    event_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    score       REAL DEFAULT 0,
    rank        INTEGER DEFAULT 0,
    joined_at   TEXT NOT NULL,
    PRIMARY KEY (event_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS pk_battles (
    id           TEXT PRIMARY KEY,
    event_id     TEXT,
    stream_a     TEXT NOT NULL,
    stream_b     TEXT NOT NULL,
    score_a      REAL DEFAULT 0,
    score_b      REAL DEFAULT 0,
    status       TEXT DEFAULT 'active',
    winner       TEXT,
    duration_sec INTEGER DEFAULT 300,
    started_at   TEXT NOT NULL,
    ended_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_status ON events(status, start_at);
  CREATE INDEX IF NOT EXISTS idx_pk_status ON pk_battles(status);
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

const app    = express();
const server = createServer(app);
const io     = new SocketServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'event-service' }));

// ── GET /events — list events ─────────────────────────────────────────────────
app.get('/', (_req, res) => {
  const status = (_req.query['status'] as string) || 'upcoming,active';
  const placeholders = status.split(',').map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM events WHERE status IN (${placeholders}) ORDER BY start_at ASC LIMIT 50`).all(...status.split(','));
  res.json(rows);
});

// ── GET /events/:id ───────────────────────────────────────────────────────────
app.get('/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params['id']) as Record<string, unknown> | undefined;
  if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
  const participants = db.prepare('SELECT * FROM participants WHERE event_id=? ORDER BY score DESC').all(req.params['id']);
  res.json({ ...event, participants });
});

// ── POST /events — create event ───────────────────────────────────────────────
const createSchema = z.object({
  type:        z.enum(['pk-tournament', 'gift-battle', 'live-contest', 'seasonal-league']),
  title:       z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  prizePool:   z.number().min(0).optional(),
  entryFee:    z.number().min(0).optional(),
  maxEntrants: z.number().min(2).max(1000).optional(),
  startAt:     z.string().datetime().optional(),
  endAt:       z.string().datetime().optional(),
});

app.post('/', requireAuth, (req: AuthReq, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO events (id,type,title,description,host_id,prize_pool,entry_fee,max_entrants,start_at,end_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, parsed.data.type, parsed.data.title, parsed.data.description ?? '', req.userId!, parsed.data.prizePool ?? 0, parsed.data.entryFee ?? 0, parsed.data.maxEntrants ?? 100, parsed.data.startAt ?? null, parsed.data.endAt ?? null, now);
  res.status(201).json({ id, ...parsed.data, hostId: req.userId!, createdAt: now });
});

// ── POST /events/:id/join ─────────────────────────────────────────────────────
app.post('/:id/join', requireAuth, (req: AuthReq, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params['id']) as { status: string; max_entrants: number } | undefined;
  if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
  if (event.status === 'ended') { res.status(400).json({ error: 'Event has ended' }); return; }
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM participants WHERE event_id=?').get(req.params['id']) as { cnt: number }).cnt;
  if (count >= event.max_entrants) { res.status(400).json({ error: 'Event is full' }); return; }
  db.prepare('INSERT OR IGNORE INTO participants (event_id,user_id,joined_at) VALUES (?,?,?)').run(req.params['id'], req.userId!, new Date().toISOString());
  redis.publish('event:joined', JSON.stringify({ eventId: req.params['id'], userId: req.userId! })).catch(() => null);
  res.json({ success: true, eventId: req.params['id'] });
});

// ── POST /events/pk — start a PK battle ──────────────────────────────────────
const pkSchema = z.object({
  streamA:     z.string(),
  streamB:     z.string(),
  eventId:     z.string().optional(),
  durationSec: z.number().min(60).max(3600).optional(),
});

app.post('/pk/start', requireAuth, (req: AuthReq, res) => {
  const parsed = pkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO pk_battles (id,event_id,stream_a,stream_b,duration_sec,started_at) VALUES (?,?,?,?,?,?)')
    .run(id, parsed.data.eventId ?? null, parsed.data.streamA, parsed.data.streamB, parsed.data.durationSec ?? 300, now);

  redis.publish('pk:battle:started', JSON.stringify({ id, streamA: parsed.data.streamA, streamB: parsed.data.streamB })).catch(() => null);
  io.to(`pk:${id}`).emit('pk_started', { id, streamA: parsed.data.streamA, streamB: parsed.data.streamB, startedAt: now });
  res.status(201).json({ id, ...parsed.data, status: 'active', startedAt: now });
});

// ── POST /events/pk/:id/score — update score ──────────────────────────────────
app.post('/pk/:id/score', requireAuth, (req: AuthReq, res) => {
  const { stream, amount } = req.body as { stream?: string; amount?: number };
  if (!stream || typeof amount !== 'number') { res.status(400).json({ error: 'stream and amount required' }); return; }
  const battle = db.prepare('SELECT * FROM pk_battles WHERE id=?').get(req.params['id']) as { stream_a: string; stream_b: string; status: string } | undefined;
  if (!battle || battle.status !== 'active') { res.status(404).json({ error: 'Active PK battle not found' }); return; }

  if (stream === battle.stream_a) {
    db.prepare('UPDATE pk_battles SET score_a = score_a + ? WHERE id=?').run(amount, req.params['id']);
  } else if (stream === battle.stream_b) {
    db.prepare('UPDATE pk_battles SET score_b = score_b + ? WHERE id=?').run(amount, req.params['id']);
  } else {
    res.status(400).json({ error: 'Stream not in this battle' }); return;
  }

  const updated = db.prepare('SELECT score_a, score_b FROM pk_battles WHERE id=?').get(req.params['id']) as { score_a: number; score_b: number };
  io.to(`pk:${req.params['id']}`).emit('pk_score_update', { battleId: req.params['id'], scoreA: updated.score_a, scoreB: updated.score_b });
  res.json({ battleId: req.params['id'], scores: updated });
});

// ── POST /events/pk/:id/end ───────────────────────────────────────────────────
app.post('/pk/:id/end', requireAuth, (req: AuthReq, res) => {
  const battle = db.prepare('SELECT * FROM pk_battles WHERE id=?').get(req.params['id']) as {
    id: string; score_a: number; score_b: number; stream_a: string; stream_b: string; status: string;
  } | undefined;
  if (!battle || battle.status !== 'active') { res.status(404).json({ error: 'Active PK not found' }); return; }
  const winner = battle.score_a >= battle.score_b ? battle.stream_a : battle.stream_b;
  db.prepare('UPDATE pk_battles SET status=?, winner=?, ended_at=? WHERE id=?').run('ended', winner, new Date().toISOString(), battle.id);
  redis.publish('pk:battle:ended', JSON.stringify({ id: battle.id, winner, scores: { a: battle.score_a, b: battle.score_b } })).catch(() => null);
  io.to(`pk:${battle.id}`).emit('pk_ended', { battleId: battle.id, winner, scores: { a: battle.score_a, b: battle.score_b } });
  res.json({ battleId: battle.id, winner, scores: { a: battle.score_a, b: battle.score_b } });
});

// Socket.IO: join PK rooms for real-time score updates
io.on('connection', (socket) => {
  socket.on('join_pk', (battleId: string) => socket.join(`pk:${battleId}`));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => log.info(`Event service running on :${PORT}`));
