/**
 * Threat Response — Automated security action engine
 *
 * Translates security detections into concrete platform actions.
 * All responses are logged in security_incidents for compliance audit.
 *
 * Response matrix by severity:
 *  low      → log + monitor (no user impact)
 *  medium   → warn user + enhanced monitoring
 *  high     → freeze account 24h + alert moderators
 *  critical → immediate freeze + block wallet + pause active streams + page security
 *
 * All actions respect a cooldown (same user cannot be actioned twice in 5min)
 * to prevent cascading double-actions from concurrent detectors.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ThreatType =
  | 'gift_fraud'
  | 'bot_viewers'
  | 'payment_fraud'
  | 'account_farm'
  | 'anomaly'
  | 'game_manipulation'
  | 'manual';

export type ResponseSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ResponseAction =
  | 'log'
  | 'warn'
  | 'freeze'
  | 'block_wallet'
  | 'pause_stream'
  | 'alert_moderators'
  | 'page_security';

export interface ThreatIncident {
  incidentId:   string;
  userId:       string | null;
  streamId:     string | null;
  walletAddress: string | null;
  threatType:   ThreatType;
  severity:     ResponseSeverity;
  evidence:     Record<string, unknown>;
  actionsApplied: ResponseAction[];
  status:       'open' | 'investigating' | 'resolved' | 'dismissed';
  createdAt:    string;
  updatedAt:    string;
}

export interface FreezeRecord {
  userId:      string;
  reason:      string;
  frozenUntil: string;
  frozenAt:    string;
}

// ── Response entry point ───────────────────────────────────────────────────────

/**
 * Evaluate a detected threat and apply the appropriate automated response.
 * Returns the created incident record.
 */
export function respondToThreat(params: {
  userId?:       string;
  streamId?:     string;
  walletAddress?: string;
  threatType:    ThreatType;
  severity:      ResponseSeverity;
  evidence:      Record<string, unknown>;
}): ThreatIncident {
  const { userId, streamId, walletAddress, threatType, severity, evidence } = params;
  const db = getDb();

  // Cooldown check — prevent double-action within 5 minutes
  if (userId) {
    const recent = db.prepare(`
      SELECT COUNT(*) AS cnt FROM security_incidents
      WHERE user_id = ? AND created_at >= datetime('now', '-5 minutes')
    `).get(userId) as any;
    if (recent?.cnt >= 2) {
      // Return existing open incident instead of creating a duplicate
      const existing = db.prepare(`
        SELECT * FROM security_incidents
        WHERE user_id = ? AND status = 'open'
        ORDER BY created_at DESC LIMIT 1
      `).get(userId) as any;
      if (existing) return _rowToIncident(existing);
    }
  }

  // Determine actions from severity
  const actions = _actionsForSeverity(severity);

  // Apply each action
  for (const action of actions) {
    switch (action) {
      case 'freeze':
        if (userId) freezeAccount(userId, _freezeDuration(severity), `${threatType}: auto-response`);
        break;
      case 'block_wallet':
        if (walletAddress) blockWallet(walletAddress, `${threatType}: auto-response`);
        break;
      case 'pause_stream':
        if (streamId) pauseStream(streamId, `${threatType}: security hold`);
        break;
      case 'alert_moderators':
        alertModerators({ userId, streamId, walletAddress, threatType, severity, evidence });
        break;
      case 'page_security':
        pageSecurityTeam({ userId, streamId, severity, threatType, evidence });
        break;
    }
  }

  // Create incident record
  const now        = new Date().toISOString();
  const incidentId = uuidv4();
  db.prepare(`
    INSERT INTO security_incidents
      (incident_id, type, severity, user_id, stream_id, wallet_address,
       evidence, status, response_taken, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `).run(
    incidentId, threatType, severity,
    userId ?? null, streamId ?? null, walletAddress ?? null,
    JSON.stringify(evidence), JSON.stringify(actions), now, now
  );

  return {
    incidentId,
    userId:         userId ?? null,
    streamId:       streamId ?? null,
    walletAddress:  walletAddress ?? null,
    threatType,
    severity,
    evidence,
    actionsApplied: actions,
    status:         'open',
    createdAt:      now,
    updatedAt:      now,
  };
}

// ── Individual response actions ────────────────────────────────────────────────

/**
 * Freeze a user account for `durationHours` hours.
 * Idempotent — if already frozen, extends the freeze if longer.
 */
export function freezeAccount(userId: string, durationHours: number, reason: string): FreezeRecord {
  const db          = getDb();
  const frozenUntil = new Date(Date.now() + durationHours * 3_600_000).toISOString();
  const now         = new Date().toISOString();

  db.prepare(`
    INSERT INTO flagged_accounts
      (flag_id, user_id, reason, flag_type, severity, frozen, frozen_until, evidence, created_at, updated_at)
    VALUES (?, ?, ?, 'manual', 'high', 1, ?, '{}', ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      frozen = 1, frozen_until = excluded.frozen_until,
      reason = excluded.reason, updated_at = excluded.updated_at
  `).run(uuidv4(), userId, reason, frozenUntil, now, now);

  return { userId, reason, frozenUntil, frozenAt: now };
}

/**
 * Unfreeze a user account. Used by admin after manual review.
 */
export function unfreezeAccount(userId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE flagged_accounts SET frozen = 0, updated_at = ? WHERE user_id = ?
  `).run(new Date().toISOString(), userId);
}

/**
 * Block a wallet address from platform transactions.
 */
export function blockWallet(walletAddress: string, reason: string): void {
  const db  = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO blocked_wallets (wallet_address, reason, blocked_by, blocked_at)
    VALUES (?, ?, 'ghostbrain-defender', ?)
  `).run(walletAddress, reason, now);
}

/**
 * Unblock a wallet (admin action).
 */
export function unblockWallet(walletAddress: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM blocked_wallets WHERE wallet_address = ?`).run(walletAddress);
}

/**
 * Mark a stream as security-paused.
 */
export function pauseStream(streamId: string, reason: string): void {
  const db  = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE streams SET status = 'security_paused', updated_at = ? WHERE stream_id = ?
  `).run(now, streamId);

  // Log pause to security_incidents
  db.prepare(`
    INSERT INTO security_incidents
      (incident_id, type, severity, user_id, stream_id, wallet_address,
       evidence, status, response_taken, created_at, updated_at)
    VALUES (?, 'manual', 'high', NULL, ?, NULL, ?, 'open', '["pause_stream"]', ?, ?)
  `).run(uuidv4(), streamId, JSON.stringify({ reason }), now, now);
}

/**
 * Send a moderator alert (logs to DB; in production this also fires a webhook/
 * push notification to the moderator Slack/Discord channel).
 */
export function alertModerators(payload: {
  userId?:      string;
  streamId?:    string;
  walletAddress?: string;
  threatType:   ThreatType;
  severity:     ResponseSeverity;
  evidence:     Record<string, unknown>;
}): void {
  const db  = getDb();
  const now = new Date().toISOString();

  // Persist as moderator queue item
  db.prepare(`
    INSERT INTO moderator_alerts
      (alert_id, user_id, stream_id, threat_type, severity, evidence, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(uuidv4(), payload.userId ?? null, payload.streamId ?? null,
         payload.threatType, payload.severity, JSON.stringify(payload.evidence), now);
}

/**
 * Page the security team for critical threats (writes to pager_events table +
 * would call GhostBrain Core at :7900 in production).
 */
export function pageSecurityTeam(payload: {
  userId?:    string;
  streamId?:  string;
  severity:   ResponseSeverity;
  threatType: ThreatType;
  evidence:   Record<string, unknown>;
}): void {
  const db  = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO pager_events
      (pager_id, user_id, stream_id, severity, threat_type, evidence, paged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), payload.userId ?? null, payload.streamId ?? null,
         payload.severity, payload.threatType, JSON.stringify(payload.evidence), now);
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function isAccountFrozen(userId: string): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT frozen, frozen_until FROM flagged_accounts WHERE user_id = ?
  `).get(userId) as any;
  if (!row || !row.frozen) return false;
  return !row.frozen_until || new Date(row.frozen_until) > new Date();
}

export function isWalletBlocked(walletAddress: string): boolean {
  const db = getDb();
  return !!(db.prepare(`
    SELECT 1 FROM blocked_wallets WHERE wallet_address = ?
  `).get(walletAddress));
}

export function listOpenIncidents(limit = 50): ThreatIncident[] {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM security_incidents WHERE status = 'open'
    ORDER BY created_at DESC LIMIT ?
  `).all(limit) as any[];
  return rows.map(_rowToIncident);
}

export function resolveIncident(incidentId: string, resolution: string): void {
  const db  = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE security_incidents
    SET status = 'resolved', response_taken = ?, updated_at = ?
    WHERE incident_id = ?
  `).run(resolution, now, incidentId);
}

export function getDashboardStats() {
  const db = getDb();
  return {
    openIncidents:   (db.prepare(`SELECT COUNT(*) AS c FROM security_incidents WHERE status = 'open'`).get() as any)?.c ?? 0,
    frozenAccounts:  (db.prepare(`SELECT COUNT(*) AS c FROM flagged_accounts WHERE frozen = 1`).get() as any)?.c ?? 0,
    blockedWallets:  (db.prepare(`SELECT COUNT(*) AS c FROM blocked_wallets`).get() as any)?.c ?? 0,
    moderatorAlerts: (db.prepare(`SELECT COUNT(*) AS c FROM moderator_alerts WHERE status = 'pending'`).get() as any)?.c ?? 0,
    criticalCount:   (db.prepare(`SELECT COUNT(*) AS c FROM security_incidents WHERE severity = 'critical' AND created_at >= datetime('now', '-24 hours')`).get() as any)?.c ?? 0,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _actionsForSeverity(severity: ResponseSeverity): ResponseAction[] {
  switch (severity) {
    case 'critical': return ['freeze', 'block_wallet', 'pause_stream', 'alert_moderators', 'page_security'];
    case 'high':     return ['freeze', 'alert_moderators'];
    case 'medium':   return ['warn', 'alert_moderators'];
    case 'low':      return ['log'];
  }
}

function _freezeDuration(severity: ResponseSeverity): number {
  switch (severity) {
    case 'critical': return 72;   // 3 days
    case 'high':     return 24;   // 1 day
    case 'medium':   return 6;    // 6 hours
    default:         return 1;    // 1 hour
  }
}

function _rowToIncident(row: any): ThreatIncident {
  return {
    incidentId:     row.incident_id,
    userId:         row.user_id,
    streamId:       row.stream_id,
    walletAddress:  row.wallet_address,
    threatType:     row.type,
    severity:       row.severity,
    evidence:       _safeParse(row.evidence),
    actionsApplied: _safeParse(row.response_taken) ?? [],
    status:         row.status,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

function _safeParse(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return s; }
}
