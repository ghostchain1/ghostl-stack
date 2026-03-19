import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { signToken } from '../middleware/auth.js';
import { ethers } from 'ethers';

const GHOST_L3_CHAIN_ID = 903;

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const walletChallengeSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId: z.literal(GHOST_L3_CHAIN_ID),
});

const walletVerifySchema = z.object({
  address: z.string(),
  challenge: z.string(),
  chainId: z.literal(GHOST_L3_CHAIN_ID),
  signature: z.string().optional(),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { username, email, password } = parsed.data;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const id = uuid();
  db.prepare(
    'INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, username, email, hash, new Date().toISOString());

  const token = signToken({ userId: id });
  res.status(201).json({ token, user: { id, username, email } });
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const db = getDb();

  const user = db
    .prepare('SELECT id, username, password_hash FROM users WHERE email = ?')
    .get(email) as { id: string; username: string; password_hash: string } | undefined;

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken({ userId: user.id });
  res.json({ token, user: { id: user.id, username: user.username, email } });
});

// Wallet challenge — issues a one-time nonce for the client to sign
const _challenges = new Map<string, { nonce: string; expires: number }>();

authRouter.post('/wallet-challenge', (req, res) => {
  const parsed = walletChallengeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { address } = parsed.data;
  const nonce = `LitVybzLive:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  _challenges.set(address.toLowerCase(), { nonce, expires: Date.now() + 120_000 });
  res.json({ challenge: nonce });
});

// Wallet verify — recovers signer from signature and issues JWT
authRouter.post('/wallet-verify', async (req, res) => {
  const parsed = walletVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { address, challenge, signature } = parsed.data;
  const stored = _challenges.get(address.toLowerCase());
  if (!stored || stored.nonce !== challenge || Date.now() > stored.expires) {
    res.status(401).json({ error: 'Invalid or expired challenge' });
    return;
  }
  _challenges.delete(address.toLowerCase());

  if (signature) {
    const recovered = ethers.verifyMessage(challenge, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      res.status(401).json({ error: 'Signature mismatch' });
      return;
    }
  }

  const db = getDb();
  let user = db.prepare('SELECT id, username FROM users WHERE wallet_address = ?').get(address) as
    | { id: string; username: string }
    | undefined;

  if (!user) {
    const id = uuid();
    const username = `ghost_${address.slice(2, 8)}`;
    db.prepare(
      'INSERT INTO users (id, username, wallet_address, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, username, address, new Date().toISOString());
    user = { id, username };
  }

  const token = signToken({ userId: user.id, walletAddress: address });
  res.json({ token, user: { id: user.id, username: user.username, walletAddress: address } });
});
