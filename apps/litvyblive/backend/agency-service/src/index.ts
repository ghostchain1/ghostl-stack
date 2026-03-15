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

const PORT       = Number(process.env.PORT       ?? 7016);
const JWT_SECRET = process.env.JWT_SECRET        ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR          ?? '/tmp/litvyblive/agency';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://localhost:6379';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/agency.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS agencies (
    id              TEXT PRIMARY KEY,
    owner_id        TEXT NOT NULL,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT DEFAULT '',
    logo_url        TEXT,
    commission_rate REAL DEFAULT 15,
    member_count    INTEGER DEFAULT 1,
    total_earnings  REAL DEFAULT 0,
    created_at      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    agency_id  TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    role       TEXT DEFAULT 'creator',
    joined_at  TEXT NOT NULL,
    PRIMARY KEY (agency_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS invites (
    id          TEXT PRIMARY KEY,
    agency_id   TEXT NOT NULL,
    invitee_id  TEXT NOT NULL,
    status      TEXT DEFAULT 'pending',
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    agency_id  TEXT NOT NULL,
    sender_id  TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
  CREATE INDEX IF NOT EXISTS idx_msg_agency ON messages(agency_id, created_at);
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

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'agency-service' }));

// ── GET /agency/me — my agency membership ────────────────────────────────────
app.get('/me', requireAuth, (req: AuthReq, res) => {
  const membership = db.prepare(`
    SELECT m.role, m.joined_at, a.* FROM members m
    JOIN agencies a ON m.agency_id = a.id
    WHERE m.user_id = ?
  `).get(req.userId!) as Record<string, unknown> | undefined;
  res.json(membership ?? null);
});

// ── GET /agency/list — top agencies ──────────────────────────────────────────
app.get('/list', (_req, res) => {
  const limit = 50;
  const rows  = db.prepare('SELECT * FROM agencies ORDER BY total_earnings DESC LIMIT ?').all(limit);
  res.json(rows);
});

// ── POST /agency — create agency ──────────────────────────────────────────────
const createSchema = z.object({
  name:           z.string().min(3).max(50),
  description:    z.string().max(500).optional(),
  logoUrl:        z.string().url().optional(),
  commissionRate: z.number().min(5).max(30).optional(),
});

app.post('/', requireAuth, (req: AuthReq, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const existing = db.prepare('SELECT id FROM members WHERE user_id=?').get(req.userId!);
  if (existing) { res.status(400).json({ error: 'Already a member of an agency' }); return; }

  const id  = uuid();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('INSERT INTO agencies (id,owner_id,name,description,logo_url,commission_rate,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, req.userId!, parsed.data.name, parsed.data.description ?? '', parsed.data.logoUrl ?? null, parsed.data.commissionRate ?? 15, now);
    db.prepare('INSERT INTO members (agency_id,user_id,role,joined_at) VALUES (?,?,?,?)')
      .run(id, req.userId!, 'owner', now);
  })();

  res.status(201).json({ id, name: parsed.data.name, ownerId: req.userId!, createdAt: now });
});

// ── GET /agency/:id — agency details + members ───────────────────────────────
app.get('/:id', (req, res) => {
  const agency = db.prepare('SELECT * FROM agencies WHERE id=?').get(req.params['id']) as Record<string, unknown> | undefined;
  if (!agency) { res.status(404).json({ error: 'Agency not found' }); return; }
  const members = db.prepare('SELECT user_id, role, joined_at FROM members WHERE agency_id=?').all(req.params['id']);
  res.json({ ...agency, members });
});

// ── POST /agency/:id/recruit — invite user ────────────────────────────────────
app.post('/:id/recruit', requireAuth, (req: AuthReq, res) => {
  const { inviteeId } = req.body as { inviteeId?: string };
  if (!inviteeId) { res.status(400).json({ error: 'inviteeId required' }); return; }
  const agency = db.prepare('SELECT owner_id FROM agencies WHERE id=?').get(req.params['id']) as { owner_id: string } | undefined;
  if (!agency) { res.status(404).json({ error: 'Agency not found' }); return; }
  const isMember = db.prepare('SELECT role FROM members WHERE agency_id=? AND user_id=?').get(req.params['id'], req.userId!);
  if (!isMember || (isMember as { role: string }).role === 'creator') { res.status(403).json({ error: 'Only owner or manager can recruit' }); return; }
  const already = db.prepare('SELECT user_id FROM members WHERE user_id=?').get(inviteeId);
  if (already) { res.status(409).json({ error: 'User already in an agency' }); return; }

  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO invites (id,agency_id,invitee_id,status,created_at) VALUES (?,?,?,?,?)')
    .run(id, req.params['id'], inviteeId, 'pending', now);

  redis.publish('agency:invite', JSON.stringify({ agencyId: req.params['id'], inviteeId, inviteId: id })).catch(() => null);
  res.json({ inviteId: id, status: 'pending' });
});

// ── POST /agency/:id/accept — accept invite ───────────────────────────────────
app.post('/:id/accept', requireAuth, (req: AuthReq, res) => {
  const invite = db.prepare(`SELECT id FROM invites WHERE agency_id=? AND invitee_id=? AND status='pending'`).get(req.params['id'], req.userId!) as { id: string } | undefined;
  if (!invite) { res.status(404).json({ error: 'No pending invite' }); return; }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE invites SET status=? WHERE id=?').run('accepted', invite.id);
    db.prepare('INSERT INTO members (agency_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(req.params['id'], req.userId!, 'creator', now);
    db.prepare('UPDATE agencies SET member_count = member_count + 1 WHERE id=?').run(req.params['id']);
  })();
  res.json({ success: true, agencyId: req.params['id'] });
});

// ── POST /agency/:id/release — remove member ─────────────────────────────────
app.post('/:id/release', requireAuth, (req: AuthReq, res) => {
  const { memberId } = req.body as { memberId?: string };
  if (!memberId) { res.status(400).json({ error: 'memberId required' }); return; }
  const agency = db.prepare('SELECT owner_id FROM agencies WHERE id=?').get(req.params['id']) as { owner_id: string } | undefined;
  if (!agency || agency.owner_id !== req.userId!) { res.status(403).json({ error: 'Only owner can release members' }); return; }
  db.transaction(() => {
    db.prepare('DELETE FROM members WHERE agency_id=? AND user_id=?').run(req.params['id'], memberId);
    db.prepare('UPDATE agencies SET member_count = member_count - 1 WHERE id=? AND member_count > 1').run(req.params['id']);
  })();
  res.json({ success: true });
});

// ── GET /agency/:id/chat — message history ────────────────────────────────────
app.get('/:id/chat', requireAuth, (req: AuthReq, res) => {
  const isMember = db.prepare('SELECT user_id FROM members WHERE agency_id=? AND user_id=?').get(req.params['id'], req.userId!);
  if (!isMember) { res.status(403).json({ error: 'Not a member' }); return; }
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare('SELECT * FROM messages WHERE agency_id=? ORDER BY created_at DESC LIMIT ?').all(req.params['id'], limit);
  res.json(rows.reverse());
});

// ── POST /agency/:id/chat — send message ──────────────────────────────────────
app.post('/:id/chat', requireAuth, (req: AuthReq, res) => {
  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: 'content required' }); return; }
  const isMember = db.prepare('SELECT user_id FROM members WHERE agency_id=? AND user_id=?').get(req.params['id'], req.userId!);
  if (!isMember) { res.status(403).json({ error: 'Not a member' }); return; }
  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO messages (id,agency_id,sender_id,content,created_at) VALUES (?,?,?,?,?)').run(id, req.params['id'], req.userId!, content.trim(), now);
  res.status(201).json({ id, agencyId: req.params['id'], senderId: req.userId!, content: content.trim(), createdAt: now });
});

// Redis sub: credit agency earnings from gift events
const sub = new Redis(REDIS_URL, { lazyConnect: true });
sub.connect().catch(() => null);
sub.subscribe('gift:sent', () => null);
sub.on('message', (_ch, msg) => {
  try {
    const { creatorId, amount } = JSON.parse(msg) as { creatorId?: string; amount?: number };
    if (!creatorId || !amount) return;
    const membership = db.prepare('SELECT agency_id FROM members WHERE user_id=?').get(creatorId) as { agency_id: string } | undefined;
    if (!membership) return;
    const agency = db.prepare('SELECT commission_rate FROM agencies WHERE id=?').get(membership.agency_id) as { commission_rate: number } | undefined;
    if (!agency) return;
    const cut = amount * (agency.commission_rate / 100);
    db.prepare('UPDATE agencies SET total_earnings = total_earnings + ? WHERE id=?').run(cut, membership.agency_id);
  } catch { /* ignore */ }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Agency service running on :${PORT}`));
