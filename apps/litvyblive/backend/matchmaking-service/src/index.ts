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
import axios from 'axios';

const PORT         = Number(process.env.PORT            ?? 7017);
const JWT_SECRET   = process.env.JWT_SECRET             ?? 'litvyblive-dev-secret';
const DATA_DIR     = process.env.DATA_DIR               ?? '/tmp/litvyblive/matchmaking';
const REDIS_URL    = process.env.REDIS_URL              ?? 'redis://localhost:6379';
const STREAM_SVC   = process.env.STREAM_SVC             ?? 'http://localhost:7012';
const RANKING_SVC  = process.env.RANKING_SVC            ?? 'http://localhost:7019';
const GHOSTBRAIN   = process.env.GHOSTBRAIN_URL         ?? 'http://localhost:7900';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/matchmaking.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS preferences (
    user_id    TEXT PRIMARY KEY,
    categories TEXT DEFAULT '[]',
    min_rank   INTEGER DEFAULT 0,
    max_rank   INTEGER DEFAULT 9999,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pk_requests (
    id              TEXT PRIMARY KEY,
    requester_id    TEXT NOT NULL,
    requester_stream TEXT NOT NULL,
    target_stream   TEXT,
    status          TEXT DEFAULT 'pending',
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
  );
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

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'matchmaking-service' }));

// ── GET /matchmaking/recommendations ─────────────────────────────────────────
app.get('/recommendations', requireAuth, async (req: AuthReq, res) => {
  const prefs = db.prepare('SELECT categories FROM preferences WHERE user_id=?').get(req.userId!) as { categories: string } | undefined;
  const wantedCategories: string[] = prefs ? JSON.parse(prefs.categories) : [];

  try {
    // Fetch live streams from stream-service
    const { data } = await axios.get<{ streams?: Array<Record<string, unknown>> }>(`${STREAM_SVC}/live`, { timeout: 3000 });
    let streams = data.streams ?? [];

    // Filter by preference if user has any
    if (wantedCategories.length > 0) {
      streams = streams.filter((s: Record<string, unknown>) => wantedCategories.includes(String(s['category'])));
    }

    // Sort by viewer count descending — simple relevance ranking
    streams.sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b['viewer_count'] ?? 0) - Number(a['viewer_count'] ?? 0));

    res.json({ recommendations: streams.slice(0, 20), source: 'rule-based' });
  } catch {
    res.json({ recommendations: [], error: 'stream-service unavailable' });
  }
});

// ── POST /matchmaking/preferences ────────────────────────────────────────────
const prefsSchema = z.object({
  categories: z.array(z.string()).optional(),
  minRank:    z.number().min(0).optional(),
  maxRank:    z.number().min(0).optional(),
});

app.post('/preferences', requireAuth, (req: AuthReq, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO preferences (user_id, categories, min_rank, max_rank, updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      categories=excluded.categories, min_rank=excluded.min_rank,
      max_rank=excluded.max_rank, updated_at=excluded.updated_at
  `).run(req.userId!, JSON.stringify(parsed.data.categories ?? []), parsed.data.minRank ?? 0, parsed.data.maxRank ?? 9999, now);
  res.json({ success: true });
});

// ── POST /matchmaking/find-pk-partner ─────────────────────────────────────────
const pkSchema = z.object({
  streamId:   z.string(),
  category:   z.string().optional(),
  minViewers: z.number().min(0).optional(),
});

app.post('/find-pk-partner', requireAuth, async (req: AuthReq, res) => {
  const parsed = pkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { streamId, category, minViewers = 0 } = parsed.data;

  try {
    const { data } = await axios.get<{ streams?: Array<Record<string, unknown>> }>(`${STREAM_SVC}/live`, { timeout: 3000 });
    let candidates = (data.streams ?? []).filter((s: Record<string, unknown>) => {
      if (s['id'] === streamId) return false;          // exclude self
      if ((s['is_pk_active'] as boolean)) return false; // already in PK
      if (Number(s['viewer_count'] ?? 0) < minViewers) return false;
      if (category && s['category'] !== category) return false;
      return true;
    });
    // Sort by closest viewer count to ensure fair match
    const myStream = (data.streams ?? []).find((s: Record<string, unknown>) => s['id'] === streamId);
    if (myStream) {
      candidates.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        Math.abs(Number(a['viewer_count']) - Number(myStream['viewer_count'])) -
        Math.abs(Number(b['viewer_count']) - Number(myStream['viewer_count']))
      );
    }
    const partner = candidates[0] ?? null;

    if (partner) {
      // Record the PK request
      const id      = uuid();
      const now     = new Date().toISOString();
      const expires = new Date(Date.now() + 60_000).toISOString(); // 60s expiry
      db.prepare('INSERT INTO pk_requests (id,requester_id,requester_stream,target_stream,created_at,expires_at) VALUES (?,?,?,?,?,?)')
        .run(id, req.userId!, streamId, String(partner['id']), now, expires);
      redis.publish('pk:request', JSON.stringify({ id, requesterId: req.userId!, requesterStream: streamId, targetStream: partner['id'] })).catch(() => null);
    }

    res.json({ partner, matchFound: !!partner });
  } catch {
    res.json({ partner: null, matchFound: false, error: 'stream-service unavailable' });
  }
});

// ── POST /matchmaking/ai-match — GhostBrain powered matching ─────────────────
app.post('/ai-match', requireAuth, async (req: AuthReq, res) => {
  try {
    const { data } = await axios.post(`${GHOSTBRAIN}/classify`, {
      action: 'matchmaking',
      userId: req.userId!,
      context: req.body,
    }, { timeout: 5000 });
    res.json({ result: data, source: 'ghostbrain' });
  } catch {
    // Fallback to rule-based
    res.json({ result: null, source: 'fallback', message: 'GhostBrain unavailable' });
  }
});

// ── GET /matchmaking/pk-requests ──────────────────────────────────────────────
app.get('/pk-requests', requireAuth, (req: AuthReq, res) => {
  const rows = db.prepare(`
    SELECT * FROM pk_requests
    WHERE (requester_id=? OR target_stream IS NOT NULL)
      AND expires_at > ?
      AND status='pending'
    ORDER BY created_at DESC LIMIT 20
  `).all(req.userId!, new Date().toISOString());
  res.json(rows);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Matchmaking service running on :${PORT}`));
