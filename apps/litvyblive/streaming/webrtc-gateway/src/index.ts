/**
 * LitVybzLive — WebRTC Gateway
 * Authentication + server-discovery gateway for WebRTC clients
 *
 * Port: 3001
 *
 * This service:
 *   1. Authenticates Flutter clients via JWT
 *   2. Selects the least-loaded mediasoup node (via Redis node registry)
 *   3. Issues a short-lived connection ticket
 *   4. Flutter client then connects directly to that mediasoup server
 *
 * This pattern avoids routing all WebRTC media through this proxy,
 * keeping media latency low while centralising auth.
 */
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import axios from 'axios';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT                 = parseInt(process.env.PORT                  ?? '3001', 10);
const REDIS_URL            = process.env.REDIS_URL                      ?? 'redis://redis:6379';
const JWT_SECRET           = process.env.JWT_SECRET                     ?? 'litvyblive-dev-secret';
const DEFAULT_MEDIASOUP_WS = process.env.MEDIASOUP_WS_URL               ?? 'ws://mediasoup-server:3000';
const STREAM_CTRL          = process.env.STREAM_CONTROLLER_URL          ?? 'http://stream-controller:3002';

// ── Helpers ───────────────────────────────────────────────────────────────────
interface JwtPayload { userId: string; username: string; iat: number; exp: number; }

function verifyToken(token: string): JwtPayload | null {
  try { return jwt.verify(token, JWT_SECRET) as JwtPayload; }
  catch { return null; }
}

interface NodeRecord {
  nodeId: string; region: string; host: string; port: number; rooms: number;
}

async function pickLeastLoadedNode(redis: Redis, preferRegion?: string): Promise<string> {
  try {
    const keys = await redis.keys('mediasoup:node:*');
    if (!keys.length) return DEFAULT_MEDIASOUP_WS;

    const nodes: NodeRecord[] = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) nodes.push(JSON.parse(raw) as NodeRecord);
    }

    // Prefer same region, then fall back to global least-loaded
    const preferred = preferRegion ? nodes.filter(n => n.region === preferRegion) : [];
    const candidates = preferred.length ? preferred : nodes;
    candidates.sort((a, b) => a.rooms - b.rooms);
    const best = candidates[0]!;
    return `ws://${best.host}:${best.port}`;
  } catch {
    return DEFAULT_MEDIASOUP_WS;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app  = express();
const http = createServer(app);
const io   = new SocketIO(http, { cors: { origin: '*' } });

app.use(express.json());

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => console.warn('[redis] unavailable'));

// Middleware: validate JWT in Authorization header
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing token' }); return; }
  const user = verifyToken(h.slice(7));
  if (!user) { res.status(401).json({ error: 'Invalid token' }); return; }
  (req as Request & { user: JwtPayload }).user = user;
  next();
}

// ── REST ──────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', port: PORT }));

/**
 * POST /connect
 * Body: { streamId, role?, region? }
 * Returns: { signalingUrl, connectionToken, streamId, userId }
 *
 * Flutter calls this before connecting to the SFU to get:
 * - The WebSocket URL of the best mediasoup server
 * - A short-lived connection token for that server
 */
app.post('/connect', requireAuth, async (req: Request, res: Response) => {
  const user = (req as Request & { user: JwtPayload }).user;
  const { streamId, role = 'consumer', region } =
    req.body as { streamId?: string; role?: string; region?: string };

  if (!streamId) { res.status(400).json({ error: 'streamId required' }); return; }

  const signalingUrl = await pickLeastLoadedNode(redis, region);

  // Short-lived token so the mediasoup server can trust the connection
  const connectionToken = jwt.sign(
    { userId: user.userId, username: user.username, streamId, role },
    JWT_SECRET,
    { expiresIn: '2h' },
  );

  // Record viewer join attempt
  await redis.publish('gateway:connect', JSON.stringify({
    userId: user.userId, streamId, role, region, signalingUrl,
  })).catch(() => {});

  res.json({ signalingUrl, connectionToken, streamId, userId: user.userId });
});

/**
 * GET /streams
 * Proxy to stream-controller — list of live streams for discovery
 */
app.get('/streams', async (_req, res) => {
  try {
    const { data } = await axios.get(`${STREAM_CTRL}/streams`, { timeout: 3000 });
    res.json(data);
  } catch { res.status(503).json({ error: 'stream controller unavailable' }); }
});

/**
 * GET /streams/:id
 * Proxy to stream-controller for single stream metadata
 */
app.get('/streams/:id', async (req, res) => {
  try {
    const { data } = await axios.get(`${STREAM_CTRL}/streams/${req.params.id}`, { timeout: 3000 });
    res.json(data);
  } catch { res.status(503).json({ error: 'stream controller unavailable' }); }
});

/**
 * GET /nodes
 * Return list of known mediasoup nodes (for admin/monitoring)
 */
app.get('/nodes', async (_req, res) => {
  try {
    const keys = await redis.keys('mediasoup:node:*');
    const nodes = await Promise.all(keys.map(async k => {
      const raw = await redis.get(k);
      return raw ? JSON.parse(raw) : null;
    }));
    res.json(nodes.filter(Boolean));
  } catch { res.json([]); }
});

// ── Socket.IO: thin presence layer ───────────────────────────────────────────
// Clients optionally connect here for presence signals before switching to SFU
io.use((socket, next) => {
  const token = socket.handshake.auth.token as string;
  if (!token) { next(new Error('Missing auth token')); return; }
  const user = verifyToken(token);
  if (!user)  { next(new Error('Invalid auth token')); return; }
  (socket as typeof socket & { user: JwtPayload }).user = user;
  next();
});

io.on('connection', async (socket) => {
  const user = (socket as typeof socket & { user: JwtPayload }).user;

  // Immediately tell client which SFU to connect to
  const region = socket.handshake.query.region as string | undefined;
  const url = await pickLeastLoadedNode(redis, region);
  socket.emit('signalingServer', { url, userId: user.userId });

  socket.on('disconnect', () => {
    redis.publish('gateway:disconnect', JSON.stringify({ userId: user.userId })).catch(() => {});
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
http.listen(PORT, () => console.log(`webrtc-gateway :${PORT}`));
