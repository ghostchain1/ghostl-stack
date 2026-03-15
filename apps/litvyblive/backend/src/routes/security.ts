/**
 * Security Dashboard API — GhostBrain Defender AI
 *
 * Admin-only endpoints for the security monitoring dashboard.
 * All routes require the `x-admin-token` header (JWT).
 *
 * Stream/user analysis endpoints can be triggered manually to force an
 * immediate scan without waiting for the background daemon.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db/index.js';
import { detectGiftFraud, analyzeGiftRing, recordGiftEvent } from '../../../security/fraud_detector.js';
import { detectBotCluster, getStreamBotStats } from '../../../security/bot_detection.js';
import { analyzePaymentRisk, getUserPaymentRisk } from '../../../security/payment_monitor.js';
import { checkAccountIntegrity } from '../../../security/account_integrity.js';
import { getRecentAnomalies } from '../../../security/anomaly_engine.js';
import {
  listOpenIncidents, resolveIncident, getDashboardStats,
  freezeAccount, unfreezeAccount, blockWallet, unblockWallet,
  isAccountFrozen, isWalletBlocked,
} from '../../../security/threat_response.js';

export const securityRouter = Router();

// ── Auth middleware (admin-only) ──────────────────────────────────────────────

function adminOnly(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!token || token !== process.env.ADMIN_API_TOKEN) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

securityRouter.use(adminOnly);

// ── Dashboard summary ─────────────────────────────────────────────────────────

// GET /security/dashboard
securityRouter.get('/dashboard', (_req, res) => {
  try {
    const stats     = getDashboardStats();
    const incidents = listOpenIncidents(10);
    const anomalies = getRecentAnomalies(24, 10);
    res.json({ ok: true, data: { stats, recentIncidents: incidents, recentAnomalies: anomalies } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Incidents ─────────────────────────────────────────────────────────────────

// GET /security/incidents?status=open&severity=critical&limit=50
securityRouter.get('/incidents', (req, res) => {
  const db       = getDb();
  const { status = 'open', severity, threat_type, limit = '50' } = req.query as Record<string, string>;

  let sql    = `SELECT * FROM security_incidents WHERE 1=1`;
  const args: unknown[] = [];

  if (status)      { sql += ` AND status = ?`;   args.push(status); }
  if (severity)    { sql += ` AND severity = ?`;  args.push(severity); }
  if (threat_type) { sql += ` AND type = ?`;      args.push(threat_type); }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  args.push(Math.min(Number(limit), 200));

  const rows = db.prepare(sql).all(...args);
  res.json({ ok: true, data: rows });
});

// GET /security/incidents/:id
securityRouter.get('/incidents/:id', (req, res) => {
  const db  = getDb();
  const row = db.prepare(`SELECT * FROM security_incidents WHERE incident_id = ?`).get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true, data: row });
});

// PATCH /security/incidents/:id/status
securityRouter.patch('/incidents/:id/status', (req, res) => {
  const { status, resolution } = req.body as { status: string; resolution?: string };
  const allowed = ['open', 'investigating', 'resolved', 'dismissed'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const db  = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE security_incidents SET status = ?, response_taken = ?, updated_at = ?
    WHERE incident_id = ?
  `).run(status, resolution ?? null, now, req.params.id);
  res.json({ ok: true });
});

// ── Flagged accounts ──────────────────────────────────────────────────────────

// GET /security/flagged?frozen=1&limit=50
securityRouter.get('/flagged', (req, res) => {
  const db = getDb();
  const { frozen, limit = '50' } = req.query as Record<string, string>;
  let sql = `SELECT * FROM flagged_accounts WHERE 1=1`;
  const args: unknown[] = [];
  if (frozen !== undefined) { sql += ` AND frozen = ?`; args.push(Number(frozen)); }
  sql += ` ORDER BY updated_at DESC LIMIT ?`;
  args.push(Math.min(Number(limit), 200));
  res.json({ ok: true, data: db.prepare(sql).all(...args) });
});

// ── Stream analysis ───────────────────────────────────────────────────────────

// POST /security/analyze/stream/:streamId
securityRouter.post('/analyze/stream/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    const [botCluster, giftRing, botStats] = await Promise.all([
      detectBotCluster(streamId),
      analyzeGiftRing(streamId),
      getStreamBotStats(streamId),
    ]);
    res.json({ ok: true, data: { streamId, botCluster, giftRing, botStats } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── User analysis ─────────────────────────────────────────────────────────────

// POST /security/analyze/user/:userId
securityRouter.post('/analyze/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { ipAddress, walletAddress, userAgent = '', screenResolution = '', timezone = '', language = '' } = req.body as Record<string, string>;
    const [paymentRisk, integrityResult] = await Promise.all([
      getUserPaymentRisk(userId),
      ipAddress
        ? checkAccountIntegrity({ userId, ipAddress, walletAddress, userAgent, screenResolution, timezone, language, registeredAt: new Date().toISOString() })
        : Promise.resolve(null),
    ]);
    const frozen  = isAccountFrozen(userId);
    res.json({ ok: true, data: { userId, paymentRisk, integrity: integrityResult, frozen } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Account freeze controls ───────────────────────────────────────────────────

// POST /security/freeze/:userId  { reason, durationHours }
securityRouter.post('/freeze/:userId', (req, res) => {
  try {
    const { reason = 'manual admin freeze', durationHours = 24 } = req.body as Record<string, any>;
    const record = freezeAccount(req.params.userId, Number(durationHours), reason);
    res.json({ ok: true, data: record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /security/unfreeze/:userId
securityRouter.post('/unfreeze/:userId', (req, res) => {
  try {
    unfreezeAccount(req.params.userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Wallet controls ───────────────────────────────────────────────────────────

// POST /security/block-wallet  { walletAddress, reason }
securityRouter.post('/block-wallet', (req, res) => {
  const { walletAddress, reason } = req.body as { walletAddress: string; reason: string };
  if (!walletAddress?.match(/^0x[0-9a-fA-F]{40}$/)) {
    res.status(400).json({ error: 'Invalid wallet address' });
    return;
  }
  if (isWalletBlocked(walletAddress)) {
    res.status(409).json({ error: 'Wallet already blocked' });
    return;
  }
  blockWallet(walletAddress, reason ?? 'manual admin block');
  res.json({ ok: true });
});

// POST /security/unblock-wallet  { walletAddress }
securityRouter.post('/unblock-wallet', (req, res) => {
  const { walletAddress } = req.body as { walletAddress: string };
  unblockWallet(walletAddress);
  res.json({ ok: true });
});

// GET /security/blocked-wallets?limit=50
securityRouter.get('/blocked-wallets', (req, res) => {
  const db    = getDb();
  const limit = Math.min(Number((req.query.limit as string) ?? '50'), 200);
  res.json({ ok: true, data: db.prepare(`SELECT * FROM blocked_wallets ORDER BY blocked_at DESC LIMIT ?`).all(limit) });
});

// ── Anomaly alerts ────────────────────────────────────────────────────────────

// GET /security/anomalies?hours=24&limit=50
securityRouter.get('/anomalies', (req, res) => {
  try {
    const hours = Number((req.query.hours as string) ?? '24');
    const limit = Math.min(Number((req.query.limit as string) ?? '50'), 200);
    const data  = getRecentAnomalies(hours, limit);
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Moderator alerts ──────────────────────────────────────────────────────────

// GET /security/moderator-alerts?status=pending
securityRouter.get('/moderator-alerts', (req, res) => {
  const db     = getDb();
  const status = (req.query.status as string) ?? 'pending';
  const rows   = db.prepare(`
    SELECT * FROM moderator_alerts WHERE status = ? ORDER BY created_at DESC LIMIT 100
  `).all(status);
  res.json({ ok: true, data: rows });
});

// PATCH /security/moderator-alerts/:id/acknowledge
securityRouter.patch('/moderator-alerts/:id/acknowledge', (req, res) => {
  const db  = getDb();
  db.prepare(`UPDATE moderator_alerts SET status = 'acknowledged' WHERE alert_id = ?`).run(req.params.id);
  res.json({ ok: true });
});
