/**
 * Identity REST API — /identity/*
 *
 * Endpoints:
 *   GET  /identity/check/:username          — username availability check
 *   GET  /identity/resolve/:username        — forward lookup (username → profile)
 *   GET  /identity/wallet/:address          — reverse lookup (wallet → profile)
 *   GET  /identity/profile/:userId          — full profile + reputation
 *   PUT  /identity/profile                  — update own profile (auth required)
 *   POST /identity/claim                    — claim / update username (auth)
 *   POST /identity/link-wallet              — link GhostWallet address (auth)
 *   POST /identity/anchor                   — record L1 anchor tx (auth)
 *   GET  /identity/reputation/:userId       — latest reputation score
 *   POST /identity/verify/request           — submit verification request (auth)
 *   GET  /identity/verify/status            — own verification status (auth)
 *   GET  /identity/verify/pending           — list pending requests (admin)
 *   POST /identity/verify/review            — approve / reject (admin)
 */

import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { authMiddleware, adminMiddleware, type AuthRequest } from '../middleware/auth.js';
import { IdentityService } from '../../../identity/identity_service.js';

export const identityRouter = Router();

// ─── Shared factory —  one service instance per request (shares DB) ──────────
function svc(): IdentityService {
  return new IdentityService(getDb());
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const claimSchema = z.object({
  username:      z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(),
});

const profileSchema = z.object({
  avatarUrl:   z.string().url().max(512).optional(),
  bio:         z.string().max(500).optional(),
  socialLinks: z.record(z.string().max(200)).optional(),
});

const linkWalletSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const anchorSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

const reviewSchema = z.object({
  userId:   z.string().uuid(),
  approved: z.boolean(),
  note:     z.string().max(500).default(''),
});

// ─── Read-only (public) ───────────────────────────────────────────────────────

identityRouter.get('/check/:username', (req, res) => {
  const username = req.params['username'] ?? '';
  const available = svc().isAvailable(username);
  res.json({ username, available, ghostHandle: `@${username.toLowerCase()}.ghost` });
});

identityRouter.get('/resolve/:username', (req, res) => {
  const identity = svc().lookupByUsername(req.params['username'] ?? '');
  if (!identity) { res.status(404).json({ error: 'Username not found' }); return; }
  res.json(identity);
});

identityRouter.get('/wallet/:address', (req, res) => {
  const address = req.params['address'] ?? '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ error: 'Invalid wallet address' });
    return;
  }
  const identity = svc().lookupByWallet(address);
  if (!identity) { res.status(404).json({ error: 'Wallet not registered' }); return; }
  res.json(identity);
});

identityRouter.get('/profile/:userId', (req, res) => {
  const service = svc();
  const profile = service.getProfile(req.params['userId'] ?? '');
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
  const reputation = service.getCachedReputation(profile.userId);
  res.json({ profile, reputation });
});

identityRouter.get('/reputation/:userId', (req, res) => {
  // Recompute on demand (caller can cache on their end)
  const score = svc().refreshReputation(req.params['userId'] ?? '');
  res.json(score);
});

// ─── Authenticated mutations ──────────────────────────────────────────────────

identityRouter.use(authMiddleware);

identityRouter.post('/claim', (req: AuthRequest, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    const identity = svc().claimUsername(
      req.userId!,
      parsed.data.username,
      parsed.data.walletAddress ?? null,
    );
    res.status(201).json(identity);
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

identityRouter.post('/link-wallet', (req: AuthRequest, res) => {
  const parsed = linkWalletSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    svc().linkWallet(req.userId!, parsed.data.walletAddress);
    res.json({ success: true });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

identityRouter.put('/profile', (req: AuthRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const profile = svc().updateProfile(req.userId!, parsed.data);
  res.json(profile);
});

identityRouter.post('/anchor', (req: AuthRequest, res) => {
  const parsed = anchorSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  svc().recordL1Anchor(req.userId!, parsed.data.txHash);
  res.json({ success: true });
});

identityRouter.post('/verify/request', (req: AuthRequest, res) => {
  try {
    svc().requestVerification(req.userId!);
    res.status(202).json({ status: 'pending' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

identityRouter.get('/verify/status', (req: AuthRequest, res) => {
  const status = svc().getVerificationStatus(req.userId!);
  if (!status) { res.status(404).json({ error: 'No verification request found' }); return; }
  res.json(status);
});

// ─── Admin endpoints ──────────────────────────────────────────────────────────
// Restricted to JWT role="admin".

identityRouter.get('/verify/pending', adminMiddleware, (_req, res) => {
  res.json(svc().listPendingVerifications());
});

identityRouter.post('/verify/review', adminMiddleware, (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    svc().reviewVerification(parsed.data.userId, parsed.data.approved, parsed.data.note);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
