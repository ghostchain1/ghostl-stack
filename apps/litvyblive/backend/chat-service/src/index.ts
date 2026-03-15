import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT       = Number(process.env.PORT      ?? 7013);
const JWT_SECRET = process.env.JWT_SECRET       ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR         ?? '/tmp/litvyblive/chat';
const REDIS_URL  = process.env.REDIS_URL        ?? 'redis://localhost:6379';

const BLOCKED_WORDS = new Set(['spam', 'scam', 'fake']); // extend via env/admin

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/chat.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    room_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    username   TEXT NOT NULL,
    content    TEXT NOT NULL,
    type       TEXT DEFAULT 'text',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_msg_room ON messages(room_id, created_at);
  CREATE TABLE IF NOT EXISTS bans (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );
`);

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

// ── Moderate message ──────────────────────────────────────────────────────────
function moderate(text: string): string {
  return text.split(/\s+/).map(w => BLOCKED_WORDS.has(w.toLowerCase()) ? '***' : w).join(' ');
}

const app  = express();
const http = createServer(app);
const io   = new SocketIOServer(http, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'chat-service' }));

// ── REST: get recent history ──────────────────────────────────────────────────
app.get('/history/:roomId', (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare(
    'SELECT * FROM messages WHERE room_id=? ORDER BY created_at DESC LIMIT ?',
  ).all(req.params['roomId'], limit);
  res.json(rows.reverse());
});

// ── REST: ban user from room (admin) ──────────────────────────────────────────
app.post('/ban', (req, res) => {
  const authHeader = req.headers['x-admin-key'];
  if (authHeader !== process.env.ADMIN_KEY && process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  const { roomId, userId } = req.body as { roomId?: string; userId?: string };
  if (!roomId || !userId) { res.status(400).json({ error: 'roomId and userId required' }); return; }
  db.prepare('INSERT OR IGNORE INTO bans (room_id, user_id) VALUES (?,?)').run(roomId, userId);
  io.to(roomId).emit('user_banned', { userId });
  res.json({ success: true });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
interface SocketUser { userId: string; username: string }

io.use((socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (!token) { next(new Error('Unauthorized')); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; username?: string };
    (socket.data as SocketUser).userId   = payload.userId;
    (socket.data as SocketUser).username = payload.username ?? `user_${payload.userId.slice(0, 6)}`;
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  const { userId, username } = socket.data as SocketUser;
  log.info(`Chat socket connected: ${userId}`);

  // ── Join room ────────────────────────────────────────────────────────────────
  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
    // Send last 50 messages on join
    const history = db.prepare(
      'SELECT * FROM messages WHERE room_id=? ORDER BY created_at DESC LIMIT 50',
    ).all(roomId);
    socket.emit('chat_history', history.reverse());
    io.to(roomId).emit('user_joined', { userId, username });
  });

  // ── Send message ─────────────────────────────────────────────────────────────
  socket.on('send_message', async (payload: { roomId: string; content: string; type?: string }) => {
    const { roomId, content, type = 'text' } = payload;
    if (!roomId || !content?.trim()) return;

    // Check ban
    const banned = db.prepare('SELECT 1 FROM bans WHERE room_id=? AND user_id=?').get(roomId, userId);
    if (banned) { socket.emit('error', { message: 'You are banned from this room' }); return; }

    const clean = moderate(content.trim().slice(0, 500));
    const id    = uuid();
    const now   = new Date().toISOString();
    db.prepare('INSERT INTO messages (id,room_id,user_id,username,content,type,created_at) VALUES (?,?,?,?,?,?,?)').run(id, roomId, userId, username, clean, type, now);

    const msg = { id, roomId, userId, username, content: clean, type, createdAt: now };
    io.to(roomId).emit('chat_message', msg);
    await redis.publish('chat:message', JSON.stringify(msg)).catch(() => null);
  });

  // ── Emoji reaction ───────────────────────────────────────────────────────────
  socket.on('reaction', (payload: { roomId: string; emoji: string }) => {
    const { roomId, emoji } = payload;
    if (!roomId || !emoji) return;
    io.to(roomId).emit('reaction', { userId, emoji, roomId });
  });

  // ── Leave ────────────────────────────────────────────────────────────────────
  socket.on('leave_room', (roomId: string) => {
    socket.leave(roomId);
    io.to(roomId).emit('user_left', { userId, username });
  });

  socket.on('disconnect', () => {
    log.info(`Chat socket disconnected: ${userId}`);
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

http.listen(PORT, () => log.info(`Chat service running on :${PORT} (WebSocket enabled)`));
