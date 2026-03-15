/**
 * LitVybzLive — Redis Event Bus
 * Central event aggregation, routing, persistence, and monitoring
 *
 * Port: 3005 (HTTP REST + WebSocket monitor)
 *
 * This service:
 *   1. Subscribes to ALL platform Redis channels
 *   2. Persists events to SQLite for replay / debugging
 *   3. Routes events to interested services via HTTP webhooks
 *   4. Exposes REST API for event querying
 *   5. WebSocket monitor for real-time event observability
 *
 * Services can publish events via:
 *   POST /events  { channel, payload }
 *
 * Or subscribe to events via:
 *   WebSocket connection → receive all events in real-time
 */
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { mkdirSync } from 'fs';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT      = parseInt(process.env.PORT     ?? '3005', 10);
const REDIS_URL = process.env.REDIS_URL         ?? 'redis://redis:6379';
const DATA_DIR  = process.env.DATA_DIR          ?? '/data';

mkdirSync(DATA_DIR, { recursive: true });

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'event-bus.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel    TEXT NOT NULL,
    payload    TEXT NOT NULL,
    received_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel);
  CREATE INDEX IF NOT EXISTS idx_events_time    ON events(received_at);

  CREATE TABLE IF NOT EXISTS webhooks (
    id         TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    channels   TEXT NOT NULL,   -- JSON array of channel patterns
    created_at INTEGER NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS channel_stats (
    channel      TEXT PRIMARY KEY,
    event_count  INTEGER NOT NULL DEFAULT 0,
    last_event   INTEGER,
    last_payload TEXT
  );
`);

// ── All channels the bus subscribes to ───────────────────────────────────────
const ALL_CHANNELS = [
  // Streaming
  'stream:started', 'stream:ended', 'stream:paused', 'stream:resumed',
  'viewer:joined',  'viewer:left',
  'stream:cohost:added',
  // PK
  'pk:battle:started', 'pk:score:updated', 'pk:battle:ended',
  // Gifts
  'gift:sent',
  // Wallet
  'wallet:debit', 'wallet:credit',
  // Users
  'auth:user:created', 'user:followed',
  // Recordings
  'recording:started', 'recording:completed', 'clip:created',
  // Games
  'game:played',
  // Agency
  'agency:invite',
  // Launchpad
  'launchpad:token:purchased',
  // Mediasoup internal
  'mediasoup:peer:joined', 'mediasoup:peer:left',
  'mediasoup:producer:new',
  // Gateway
  'gateway:connect', 'gateway:disconnect',
  // Fraud
  'fraud:alert',
  // General
  'notification:sent',
];

// ── Prepared statements ───────────────────────────────────────────────────────
const insertEvent = db.prepare(
  'INSERT INTO events (channel, payload, received_at) VALUES (?, ?, ?)',
);
const upsertStats = db.prepare(`
  INSERT INTO channel_stats (channel, event_count, last_event, last_payload)
  VALUES (@ch, 1, @now, @payload)
  ON CONFLICT(channel) DO UPDATE SET
    event_count = event_count + 1,
    last_event  = @now,
    last_payload = @payload
`);
const getChannelStats = db.prepare('SELECT * FROM channel_stats ORDER BY event_count DESC');
const recentEvents = db.prepare(
  'SELECT * FROM events WHERE channel=? ORDER BY received_at DESC LIMIT ?',
);
const allRecentEvents = db.prepare(
  'SELECT * FROM events ORDER BY received_at DESC LIMIT ?',
);
const eventsSince = db.prepare(
  'SELECT * FROM events WHERE received_at >= ? ORDER BY received_at ASC',
);

// ── App setup ─────────────────────────────────────────────────────────────────
const app  = express();
const http = createServer(app);
const io   = new SocketIO(http, { cors: { origin: '*' } });
app.use(express.json());

const pub = new Redis(REDIS_URL, { lazyConnect: true });
const sub = new Redis(REDIS_URL, { lazyConnect: true });
pub.connect().catch(() => console.warn('[redis:pub] unavailable'));
sub.connect().catch(() => console.warn('[redis:sub] unavailable'));

// ── Subscribe to all channels ─────────────────────────────────────────────────
sub.on('connect', () => {
  sub.subscribe(...ALL_CHANNELS).catch(console.error);
  console.log(`[bus] Subscribed to ${ALL_CHANNELS.length} channels`);
});

let totalEvents = 0;

sub.on('message', (channel: string, message: string) => {
  totalEvents++;

  // Persist to SQLite
  try {
    insertEvent.run(channel, message, Date.now());
    upsertStats.run({ ch: channel, now: Date.now(), payload: message });
  } catch (e) {
    console.error('[bus] DB write error:', e);
  }

  // Broadcast to WebSocket monitors
  io.emit('event', { channel, payload: JSON.parse(message), ts: Date.now() });

  // Domain-level routing logic
  routeEvent(channel, message).catch((e) => console.error('[bus] route error:', e));
});

// ── Event routing ─────────────────────────────────────────────────────────────
const ROUTING_MAP: Record<string, string[]> = {
  'gift:sent':                ['wallet-service', 'ranking-service', 'treasury-service', 'notification-service', 'analytics-service', 'fraud-service'],
  'stream:started':           ['analytics-service', 'notification-service', 'ffmpeg-transcoder'],
  'stream:ended':             ['ranking-service', 'analytics-service', 'ffmpeg-transcoder'],
  'viewer:joined':            ['analytics-service'],
  'viewer:left':              ['analytics-service'],
  'auth:user:created':        ['analytics-service'],
  'user:followed':            ['notification-service', 'analytics-service'],
  'pk:battle:started':        ['notification-service', 'event-service'],
  'pk:score:updated':         ['event-service'],
  'pk:battle:ended':          ['event-service', 'notification-service'],
  'game:played':              ['analytics-service'],
  'launchpad:token:purchased':['analytics-service'],
  'recording:completed':      ['analytics-service'],
};

// Webhook delivery queue (simple in-memory; production would use BullMQ)
const pendingWebhooks: Array<{ url: string; event: object }> = [];

async function deliverWebhooks(): Promise<void> {
  if (!pendingWebhooks.length) return;
  const batch = pendingWebhooks.splice(0, 10);
  for (const { url, event } of batch) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000);
      await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(event),
        signal:  controller.signal,
      });
      clearTimeout(tid);
    } catch { /* swallow — webhooks are best-effort */ }
  }
}

async function routeEvent(channel: string, message: string): Promise<void> {
  // Check registered webhooks
  const hooks = db.prepare(
    `SELECT * FROM webhooks WHERE active=1`,
  ).all() as Array<{ id: string; url: string; channels: string }>;

  for (const hook of hooks) {
    const patterns = JSON.parse(hook.channels) as string[];
    const matches  = patterns.some(p => {
      if (p.endsWith('*')) return channel.startsWith(p.slice(0, -1));
      return channel === p;
    });
    if (matches) {
      pendingWebhooks.push({
        url:   hook.url,
        event: { channel, payload: JSON.parse(message), ts: Date.now() },
      });
    }
  }
}

// Process webhook queue every 500ms
setInterval(deliverWebhooks, 500);

// ── REST ──────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', totalEvents, channels: ALL_CHANNELS.length,
             activeWebhooks: db.prepare('SELECT COUNT(*) as n FROM webhooks WHERE active=1')
               .get() as { n: number } });
});

/** POST /events — publish an event to Redis */
app.post('/events', async (req, res) => {
  const { channel, payload } = req.body as { channel: string; payload: unknown };
  if (!channel || payload === undefined) {
    return res.status(400).json({ error: 'channel and payload required' });
  }
  await pub.publish(channel, JSON.stringify(payload));
  res.json({ published: true, channel });
});

/** POST /events/batch — publish multiple events */
app.post('/events/batch', async (req, res) => {
  const events = req.body as Array<{ channel: string; payload: unknown }>;
  if (!Array.isArray(events)) return res.status(400).json({ error: 'Array required' });
  const pipeline = pub.pipeline();
  for (const { channel, payload } of events) pipeline.publish(channel, JSON.stringify(payload));
  await pipeline.exec();
  res.json({ published: events.length });
});

/** GET /events — query recent events */
app.get('/events', (req, res) => {
  const limit   = Math.min(parseInt(req.query.limit as string ?? '100', 10), 1000);
  const channel = req.query.channel as string | undefined;
  const since   = req.query.since   as string | undefined;

  let rows: unknown[];
  if (since) {
    rows = eventsSince.all(parseInt(since, 10));
  } else if (channel) {
    rows = recentEvents.all(channel, limit);
  } else {
    rows = allRecentEvents.all(limit);
  }

  res.json((rows as Array<Record<string, unknown>>).map(r => ({
    ...r,
    payload: JSON.parse(r.payload as string),
  })));
});

/** GET /stats — channel statistics */
app.get('/stats', (_req, res) => {
  const stats = getChannelStats.all() as Array<Record<string, unknown>>;
  res.json({
    totalEvents,
    channels: stats.map(s => ({
      ...s,
      last_payload: s.last_payload ? JSON.parse(s.last_payload as string) : null,
    })),
  });
});

/** GET /channels — list all subscribed channels */
app.get('/channels', (_req, res) => res.json(ALL_CHANNELS));

// ── Webhook management ────────────────────────────────────────────────────────
app.post('/webhooks', (req, res) => {
  const { url, channels } = req.body as { url: string; channels: string[] };
  if (!url || !Array.isArray(channels)) {
    return res.status(400).json({ error: 'url and channels[] required' });
  }
  const id = `wh-${Date.now()}`;
  db.prepare(
    'INSERT INTO webhooks (id,url,channels,created_at) VALUES (?,?,?,?)',
  ).run(id, url, JSON.stringify(channels), Date.now());
  res.status(201).json({ id, url, channels });
});

app.get('/webhooks', (_req, res) => {
  const hooks = db.prepare('SELECT * FROM webhooks WHERE active=1').all() as Array<Record<string, unknown>>;
  res.json(hooks.map(h => ({ ...h, channels: JSON.parse(h.channels as string) })));
});

app.delete('/webhooks/:id', (req, res) => {
  db.prepare('UPDATE webhooks SET active=0 WHERE id=?').run(req.params.id);
  res.json({ removed: true });
});

// ── WebSocket monitor ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Send last 20 events on connect for initial state
  const recent = (allRecentEvents.all(20) as Array<Record<string, unknown>>).map(r => ({
    ...r, payload: JSON.parse(r.payload as string),
  }));
  socket.emit('history', recent);

  // Allow client to filter by channel
  socket.on('subscribe', ({ channels }: { channels: string[] }) => {
    channels.forEach(c => socket.join(`ch:${c}`));
  });
});

// ── Periodic cleanup (keep last 7 days) ──────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const { changes } = db.prepare('DELETE FROM events WHERE received_at < ?').run(cutoff);
  if (changes > 0) console.log(`[bus] Pruned ${changes} old events`);
}, 60 * 60 * 1000); // hourly

// ── Boot ──────────────────────────────────────────────────────────────────────
http.listen(PORT, () =>
  console.log(`redis-bus :${PORT}  subscribed to ${ALL_CHANNELS.length} channels`));
