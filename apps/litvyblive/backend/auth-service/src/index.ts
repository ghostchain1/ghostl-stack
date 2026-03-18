import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers'; // brand-enforcer-ignore
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT       = Number(process.env.PORT      ?? 7010);
const JWT_SECRET = process.env.JWT_SECRET       ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR         ?? '/tmp/litvyblive/auth';
const REDIS_URL  = process.env.REDIS_URL        ?? 'redis://localhost:6379';
const GHOST_L3_CHAIN_ID = 903;
const JWT_EXPIRY = '7d';

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// ── SQLite ────────────────────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/auth.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    username       TEXT UNIQUE NOT NULL,
    email          TEXT UNIQUE,
    password_hash  TEXT,
    wallet_address TEXT UNIQUE,
    gst_balance    REAL    DEFAULT 1000,
    staked_gst     REAL    DEFAULT 0,
    role           TEXT    DEFAULT 'user',
    is_active      INTEGER DEFAULT 1,
    created_at     TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

// ── Redis event bus ───────────────────────────────────────────────────────────
const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable — events disabled'));

function signToken(payload: Record<string, string>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'auth', chain: GHOST_L3_CHAIN_ID }));

// ── Schemas ───────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email:    z.string().email(),
  password: z.string().min(8).max(128),
});
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});
const walletChallengeSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId: z.literal(GHOST_L3_CHAIN_ID),
});

// ── Register ──────────────────────────────────────────────────────────────────
app.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { username, email, password } = parsed.data;

  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
    res.status(409).json({ error: 'Email already registered' }); return;
  }
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
    res.status(409).json({ error: 'Username already taken' }); return;
  }

  const hash = await bcrypt.hash(password, 12);
  const id   = uuid();
  db.prepare(
    'INSERT INTO users (id,username,email,password_hash,created_at) VALUES (?,?,?,?,?)',
  ).run(id, username, email, hash, new Date().toISOString());

  await redis.publish('auth:user:created', JSON.stringify({ id, username, email }));
  res.status(201).json({ token: signToken({ userId: id }), user: { id, username, email } });
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { email, password } = parsed.data;

  const user = db.prepare(
    'SELECT id, username, password_hash FROM users WHERE email=? AND is_active=1',
  ).get(email) as { id: string; username: string; password_hash: string } | undefined;

  if (!user || !(await bcrypt.compare(password, user.password_hash ?? ''))) {
    res.status(401).json({ error: 'Invalid credentials' }); return;
  }

  await redis.publish('auth:user:login', JSON.stringify({ userId: user.id }));
  res.json({ token: signToken({ userId: user.id }), user: { id: user.id, username: user.username, email } });
});

// ── GhostWallet challenge ─────────────────────────────────────────────────────
const _challenges = new Map<string, { nonce: string; expires: number }>();

app.post('/wallet-challenge', (req, res) => {
  const parsed = walletChallengeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { address } = parsed.data;
  const nonce = `LitVybzLive:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  _challenges.set(address.toLowerCase(), { nonce, expires: Date.now() + 120_000 });
  res.json({ challenge: nonce, chainId: GHOST_L3_CHAIN_ID });
});

// ── GhostWallet verify ────────────────────────────────────────────────────────
app.post('/wallet-verify', async (req, res) => {
  const { address, challenge, signature } = req.body as {
    address?: string; challenge?: string; signature?: string;
  };
  if (!address || !challenge) {
    res.status(400).json({ error: 'address and challenge required' }); return;
  }
  const stored = _challenges.get(address.toLowerCase());
  if (!stored || stored.nonce !== challenge || Date.now() > stored.expires) {
    res.status(401).json({ error: 'Invalid or expired challenge' }); return;
  }
  _challenges.delete(address.toLowerCase());

  if (signature) {
    const recovered = ethers.verifyMessage(challenge, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      res.status(401).json({ error: 'Signature mismatch' }); return;
    }
  }

  let user = db.prepare(
    'SELECT id, username FROM users WHERE wallet_address=?',
  ).get(address) as { id: string; username: string } | undefined;

  if (!user) {
    const id       = uuid();
    const username = `ghost_${address.slice(2, 8).toLowerCase()}`;
    db.prepare(
      'INSERT INTO users (id,username,wallet_address,created_at) VALUES (?,?,?,?)',
    ).run(id, username, address, new Date().toISOString());
    user = { id, username };
    await redis.publish('auth:user:created', JSON.stringify({ id, username, walletAddress: address }));
  }

  res.json({
    token: signToken({ userId: user.id, walletAddress: address }),
    user: { id: user.id, username: user.username, walletAddress: address, chainId: GHOST_L3_CHAIN_ID },
  });
});

// ── Token refresh ─────────────────────────────────────────────────────────────
app.post('/refresh', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as Record<string, unknown>;
    const { iat: _iat, exp: _exp, ...claims } = payload;
    res.json({ token: signToken(claims as Record<string, string>) });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────────
app.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const { userId } = jwt.verify(header.slice(7), JWT_SECRET) as { userId: string };
    const user = db.prepare(
      'SELECT id, username, email, wallet_address, role, gst_balance, staked_gst, created_at FROM users WHERE id=?',
    ).get(userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Auth service running on :${PORT}`));
