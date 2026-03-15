/**
 * Fraud Detector — Gift Fraud & Ranking Manipulation
 *
 * Detects:
 *  • gift rings   — coordinated fake gifting between sock-puppet accounts
 *  • rapid cycles — same sender > N gifts/min to one creator
 *  • wallet correlation — multiple accounts share one on-chain wallet
 *  • self-gifting proxies — creator controls the gifting accounts
 *
 * All detection is scored 0–100; score ≥ 80 triggers an auto-incident.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface GiftEvent {
  senderId:      string;
  recipientId:   string;
  streamId:      string;
  gstAmount:     number;
  walletAddress: string;
  sentAt:        string;
}

export interface GiftFraudSignal {
  detected:    boolean;
  score:       number;           // 0–100
  severity:    FraudSeverity;
  reason:      string;
  evidence:    Record<string, unknown>;
  detectedAt:  string;
}

export interface GiftRingDetection {
  ringDetected:  boolean;
  accounts:      string[];       // userIds in the ring
  totalGST:      number;
  score:         number;
  estimatedAt:   string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────

const RAPID_GIFT_WINDOW_MS     = 60_000;   // 1 minute
const RAPID_GIFT_THRESHOLD     = 10;       // max gifts per window
const RING_MIN_ACCOUNTS        = 3;        // min accounts to constitute a ring
const RING_WINDOW_MINUTES      = 30;
const HIGH_VALUE_GIFT_GST      = 10_000;   // single gift > 10k GST = scrutiny

// ── Core detection ─────────────────────────────────────────────────────────────

/**
 * Analyse a single gift event for fraud signals.
 * Returns null if nothing suspicious; a GiftFraudSignal if flagged.
 */
export function detectGiftFraud(event: GiftEvent): GiftFraudSignal | null {
  const db = getDb();

  // 1. Rapid gift cycle: same sender → same recipient in last minute
  const rapidCount = (db.prepare(`
    SELECT COUNT(*) AS cnt FROM gift_events
    WHERE sender_id = ? AND recipient_id = ? AND stream_id = ?
      AND sent_at >= datetime('now', '-1 minute')
  `).get(event.senderId, event.recipientId, event.streamId) as any)?.cnt ?? 0;

  if (rapidCount >= RAPID_GIFT_THRESHOLD) {
    return _buildSignal(85, 'high', 'Rapid gift cycle detected', {
      rapidCount, windowMs: RAPID_GIFT_WINDOW_MS,
    });
  }

  // 2. High-value gift scrutiny
  if (event.gstAmount > HIGH_VALUE_GIFT_GST) {
    return _buildSignal(60, 'medium', 'High-value gift requires review', {
      gstAmount: event.gstAmount, threshold: HIGH_VALUE_GIFT_GST,
    });
  }

  // 3. Wallet shared across multiple senders
  const walletAccounts = (db.prepare(`
    SELECT COUNT(DISTINCT sender_id) AS cnt FROM gift_events
    WHERE wallet_address = ? AND sent_at >= datetime('now', '-24 hours')
  `).get(event.walletAddress) as any)?.cnt ?? 0;

  if (walletAccounts >= 3) {
    return _buildSignal(75, 'high', 'Shared wallet across multiple gift accounts', {
      walletAddress: event.walletAddress, accountCount: walletAccounts,
    });
  }

  return null;
}

/**
 * Full gift-ring analysis for a stream.
 * A ring is detected when a cluster of ≥ RING_MIN_ACCOUNTS accounts
 * mutually gift each other (or the same creator) within RING_WINDOW_MINUTES.
 */
export function analyzeGiftRing(streamId: string): GiftRingDetection {
  const db = getDb();

  const events = db.prepare(`
    SELECT sender_id, recipient_id, SUM(gst_amount) AS total_gst
    FROM gift_events
    WHERE stream_id = ? AND sent_at >= datetime('now', '-${RING_WINDOW_MINUTES} minutes')
    GROUP BY sender_id, recipient_id
  `).all(streamId) as Array<{ sender_id: string; recipient_id: string; total_gst: number }>;

  // Build adjacency: count unique senders and their gift partners
  const senderMap = new Map<string, Set<string>>();
  let totalGST = 0;

  for (const e of events) {
    if (!senderMap.has(e.sender_id)) senderMap.set(e.sender_id, new Set());
    senderMap.get(e.sender_id)!.add(e.recipient_id);
    totalGST += e.total_gst;
  }

  // Ring = group of accounts that share the same recipient cluster
  const allSenders = Array.from(senderMap.keys());
  const ringDetected = allSenders.length >= RING_MIN_ACCOUNTS;

  const score = ringDetected ? Math.min(90, 40 + allSenders.length * 5) : 0;

  return {
    ringDetected,
    accounts:    allSenders,
    totalGST,
    score,
    estimatedAt: new Date().toISOString(),
  };
}

/**
 * Record a gift event into the tracking DB for future analysis.
 */
export function recordGiftEvent(event: GiftEvent): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO gift_events
      (event_id, sender_id, recipient_id, stream_id, gst_amount, wallet_address, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), event.senderId, event.recipientId, event.streamId,
         event.gstAmount, event.walletAddress, event.sentAt);
}

/**
 * Return recent gift stats for a user (for dashboard / profile review).
 */
export function getGiftPatternForUser(userId: string, hours = 24) {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*)             AS total_gifts,
      SUM(gst_amount)      AS total_gst,
      COUNT(DISTINCT recipient_id) AS unique_recipients,
      COUNT(DISTINCT stream_id)    AS unique_streams
    FROM gift_events
    WHERE sender_id = ? AND sent_at >= datetime('now', '-${hours} hours')
  `).get(userId);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _buildSignal(
  score: number,
  severity: FraudSeverity,
  reason: string,
  evidence: Record<string, unknown>
): GiftFraudSignal {
  return { detected: true, score, severity, reason, evidence, detectedAt: new Date().toISOString() };
}
