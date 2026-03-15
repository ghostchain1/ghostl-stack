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
import { Server as SocketServer, Socket } from 'socket.io';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT       = Number(process.env.PORT       ?? 7026);
const JWT_SECRET = process.env.JWT_SECRET        ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR          ?? '/tmp/litvyblive/notifications';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://localhost:6379';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/notifications.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    data       TEXT DEFAULT '{}',
    read       INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at);
  CREATE INDEX IF NOT EXISTS idx_notif_type ON notifications(type, created_at);
`);

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

// In-memory map: userId → socket IDs (for real-time delivery)
const onlineSockets = new Map<string, Set<string>>();

function addOnline(userId: string, socketId: string): void {
  const set = onlineSockets.get(userId) ?? new Set<string>();
  set.add(socketId);
  onlineSockets.set(userId, set);
}

function removeOnline(userId: string, socketId: string): void {
  const set = onlineSockets.get(userId);
  if (set) { set.delete(socketId); if (!set.size) onlineSockets.delete(userId); }
}

function createNotification(userId: string, type: string, title: string, body: string, data: Record<string, unknown> = {}): string {
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO notifications (id,user_id,type,title,body,data,created_at) VALUES (?,?,?,?,?,?,?)').run(id, userId, type, title, body, JSON.stringify(data), now);
  return id;
}

function pushToUser(userId: string, payload: Record<string, unknown>): void {
  const sids = onlineSockets.get(userId);
  if (sids) {
    for (const sid of sids) {
      io.to(sid).emit('notification', payload);
    }
  }
}

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

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service', onlineUsers: onlineSockets.size }));

// ── GET /notifications/:userId ────────────────────────────────────────────────
app.get('/:userId', requireAuth, (req: AuthReq, res) => {
  if (req.params['userId'] !== req.userId!) { res.status(403).json({ error: 'Access denied' }); return; }
  const limit  = Math.min(Number(req.query['limit'] ?? 50), 200);
  const unread = req.query['unread'] === 'true';
  const rows   = unread
    ? db.prepare('SELECT * FROM notifications WHERE user_id=? AND read=0 ORDER BY created_at DESC LIMIT ?').all(req.userId!, limit)
    : db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(req.userId!, limit);
  const unreadCount = (db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id=? AND read=0').get(req.userId!) as { cnt: number }).cnt;
  res.json({ notifications: rows, unreadCount });
});

// ── POST /notifications/:id/read ──────────────────────────────────────────────
app.post('/:id/read', requireAuth, (req: AuthReq, res) => {
  const n = db.prepare('SELECT user_id FROM notifications WHERE id=?').get(req.params['id']) as { user_id: string } | undefined;
  if (!n) { res.status(404).json({ error: 'Notification not found' }); return; }
  if (n.user_id !== req.userId!) { res.status(403).json({ error: 'Access denied' }); return; }
  db.prepare('UPDATE notifications SET read=1 WHERE id=?').run(req.params['id']);
  res.json({ success: true });
});

// ── POST /notifications/read-all ──────────────────────────────────────────────
app.post('/read-all', requireAuth, (req: AuthReq, res) => {
  db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.userId!);
  res.json({ success: true });
});

// ── POST /notifications/broadcast (admin) ─────────────────────────────────────
const broadcastSchema = z.object({
  title:   z.string().min(1).max(100),
  body:    z.string().min(1).max(500),
  type:    z.string().default('system'),
  userIds: z.array(z.string()).optional(),  // empty = all online users
});

app.post('/broadcast', requireAuth, (req: AuthReq, res) => {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { title, body, type, userIds } = parsed.data;
  const targets = userIds?.length ? userIds : Array.from(onlineSockets.keys());
  let sent = 0;
  for (const uid of targets) {
    const id = createNotification(uid, type, title, body, { broadcast: true });
    pushToUser(uid, { id, type, title, body, createdAt: new Date().toISOString() });
    sent++;
  }
  res.json({ sent, targets: targets.length });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.use((socket: Socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (!token) { next(new Error('Authentication required')); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    (socket as Socket & { userId?: string }).userId = payload.userId;
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket: Socket) => {
  const userId = (socket as Socket & { userId?: string }).userId;
  if (!userId) { socket.disconnect(); return; }

  addOnline(userId, socket.id);
  log.info('User connected to notifications', { userId, socketId: socket.id });

  // Send unread count on connect
  const unreadCount = (db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id=? AND read=0').get(userId) as { cnt: number }).cnt;
  socket.emit('unread_count', { count: unreadCount });

  socket.on('mark_read', (notifId: string) => {
    db.prepare('UPDATE notifications SET read=1 WHERE id=? AND user_id=?').run(notifId, userId);
    socket.emit('marked_read', { id: notifId });
  });

  socket.on('disconnect', () => {
    removeOnline(userId, socket.id);
    log.info('User disconnected from notifications', { userId });
  });
});

// ── Redis: generate notifications from all platform events ────────────────────
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
const EVENTS_TO_NOTIFY = ['gift:sent', 'user:followed', 'stream:started', 'pk:battle:started', 'auth:user:created'];
sub.subscribe(...EVENTS_TO_NOTIFY, () => null);

sub.on('message', (ch, msg) => {
  try {
    const ev = JSON.parse(msg) as {
      senderId?: string; creatorId?: string; amount?: number; giftName?: string;
      followerId?: string; followeeId?: string;
      hostId?: string; streamId?: string; title?: string;
      id?: string;
    };

    if (ch === 'gift:sent' && ev.creatorId && ev.senderId && ev.amount) {
      const id = createNotification(ev.creatorId, 'gift_received', '🎁 You received a gift!',
        `${ev.senderId} sent you ${ev.giftName ?? 'a gift'} (${ev.amount} GST)`,
        { senderId: ev.senderId, amount: ev.amount });
      const row = db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
      pushToUser(ev.creatorId, row as Record<string, unknown>);
    }

    if (ch === 'user:followed' && ev.followeeId && ev.followerId) {
      const id = createNotification(ev.followeeId, 'new_follower', '🔔 New Follower',
        `${ev.followerId} is now following you!`,
        { followerId: ev.followerId });
      const row = db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
      pushToUser(ev.followeeId, row as Record<string, unknown>);
    }

    if (ch === 'pk:battle:started' && ev.id) {
      const id = createNotification(ev.creatorId ?? 'system', 'pk_challenge', '⚔️ PK Battle Starting!',
        'A PK battle has started — join now!',
        { battleId: ev.id });
      const row = db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
      // Broadcast to all online users for PK events
      for (const uid of onlineSockets.keys()) {
        pushToUser(uid, row as Record<string, unknown>);
      }
    }
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => log.info(`Notification service running on :${PORT} (WebSocket enabled)`));
