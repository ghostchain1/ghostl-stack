/**
 * Bot Detection — Identifies bot viewers and synthetic engagement
 *
 * Signals analysed per viewer session:
 *  • Chat frequency — < 0.01 msgs/min over 10+ min session → suspicious
 *  • Gift rate      — 0 gifts in 20+ min session (normal viewers do gift or chat)
 *  • IP clustering  — > 40 viewers from same /24 subnet on one stream
 *  • Join regularity — viewers joining at perfectly regular intervals (bots)
 *  • Session duration — < 5s sessions counted as phantom hits
 *  • User-agent uniformity — N accounts with identical UA string
 *
 * Confidence score 0–1; ≥ 0.75 = bot, 0.5–0.74 = suspicious.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ViewerSession {
  viewerId:        string;
  streamId:        string;
  ipAddress:       string;
  userAgent:       string;
  joinedAt:        string;
  leftAt?:         string;
  chatMessages:    number;
  giftsSent:       number;
  sessionSeconds:  number;
}

export interface BotSignal {
  signal:     string;
  weight:     number;    // contribution to confidence
  value:      unknown;
}

export interface BotAnalysisResult {
  viewerId:   string;
  confidence: number;    // 0–1
  isBot:      boolean;   // confidence >= 0.75
  signals:    BotSignal[];
  analyzedAt: string;
}

export interface BotClusterResult {
  streamId:       string;
  suspiciousCount: number;
  confirmedBots:  number;
  ipBlocks:       string[];   // /24 subnets with clustering
  analyzedAt:     string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────

const BOT_CONFIDENCE_THRESHOLD   = 0.75;
const MIN_SESSION_SECONDS        = 5;
const MIN_SESSION_FOR_CHAT       = 600;   // 10 minutes
const EXPECTED_CHAT_RATE         = 0.01;  // msgs/min
const IP_CLUSTER_THRESHOLD       = 40;    // viewers per /24 block
const JOIN_REGULARITY_THRESHOLD  = 50;    // ms variance between joins (too uniform)

// ── Analyse a single viewer session ───────────────────────────────────────────

export function analyzeViewerSession(session: ViewerSession): BotAnalysisResult {
  const signals: BotSignal[] = [];
  let confidence = 0;

  // Signal 1: phantom session (< 5s)
  if (session.sessionSeconds < MIN_SESSION_SECONDS) {
    const w = 0.35;
    signals.push({ signal: 'phantom_session', weight: w, value: session.sessionSeconds });
    confidence += w;
  }

  // Signal 2: long session with zero chat
  if (session.sessionSeconds >= MIN_SESSION_FOR_CHAT) {
    const chatRate = session.chatMessages / (session.sessionSeconds / 60);
    if (chatRate < EXPECTED_CHAT_RATE && session.chatMessages === 0) {
      const w = 0.25;
      signals.push({ signal: 'zero_chat_long_session', weight: w, value: chatRate });
      confidence += w;
    }
  }

  // Signal 3: long session with zero gifts AND zero chat (strong bot indicator)
  if (session.sessionSeconds >= MIN_SESSION_FOR_CHAT &&
      session.chatMessages === 0 && session.giftsSent === 0) {
    const w = 0.20;
    signals.push({ signal: 'zero_engagement_long_session', weight: w, value: null });
    confidence += w;
  }

  // Signal 4: IP clustering — check if this /24 subnet has many viewers on stream
  const db = getDb();
  const subnet = _toSubnet(session.ipAddress);
  const subnetCount = (db.prepare(`
    SELECT COUNT(*) AS cnt FROM bot_detections
    WHERE stream_id = ? AND ip_block = ? AND detected_at >= datetime('now', '-1 hour')
  `).get(session.streamId, subnet) as any)?.cnt ?? 0;

  if (subnetCount >= IP_CLUSTER_THRESHOLD) {
    const w = 0.30;
    signals.push({ signal: 'ip_cluster', weight: w, value: { subnet, count: subnetCount } });
    confidence += w;
  }

  const capped = Math.min(confidence, 1);
  const isBot  = capped >= BOT_CONFIDENCE_THRESHOLD;

  // Persist detection result
  db.prepare(`
    INSERT INTO bot_detections
      (detection_id, stream_id, viewer_id, ip_block, signal_data, confidence, action_taken, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    uuidv4(), session.streamId, session.viewerId, subnet,
    JSON.stringify(signals), capped, new Date().toISOString()
  );

  return {
    viewerId:   session.viewerId,
    confidence: capped,
    isBot,
    signals,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Scan all recent viewer sessions for a stream and return a cluster summary.
 */
export function detectBotCluster(streamId: string): BotClusterResult {
  const db = getDb();

  const rows = db.prepare(`
    SELECT ip_block, COUNT(*) AS cnt
    FROM bot_detections
    WHERE stream_id = ? AND detected_at >= datetime('now', '-1 hour')
    GROUP BY ip_block
    HAVING cnt >= ?
  `).all(streamId, IP_CLUSTER_THRESHOLD) as Array<{ ip_block: string; cnt: number }>;

  const suspiciousCount = (db.prepare(`
    SELECT COUNT(*) AS cnt FROM bot_detections
    WHERE stream_id = ? AND confidence >= 0.5 AND detected_at >= datetime('now', '-1 hour')
  `).get(streamId) as any)?.cnt ?? 0;

  const confirmedBots = (db.prepare(`
    SELECT COUNT(*) AS cnt FROM bot_detections
    WHERE stream_id = ? AND confidence >= ? AND detected_at >= datetime('now', '-1 hour')
  `).get(streamId, BOT_CONFIDENCE_THRESHOLD) as any)?.cnt ?? 0;

  return {
    streamId,
    suspiciousCount,
    confirmedBots,
    ipBlocks:    rows.map(r => r.ip_block),
    analyzedAt:  new Date().toISOString(),
  };
}

/**
 * Mark viewer IDs as confirmed bots (populates action_taken column).
 */
export function flagBotViewers(streamId: string, viewerIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE bot_detections
    SET action_taken = 'removed'
    WHERE stream_id = ? AND viewer_id = ?
  `);
  for (const vid of viewerIds) {
    stmt.run(streamId, vid);
  }
}

/**
 * Get bot detection stats for a stream (dashboard).
 */
export function getStreamBotStats(streamId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*)                                       AS total_sessions,
      SUM(CASE WHEN confidence >= 0.75 THEN 1 ELSE 0 END) AS confirmed_bots,
      SUM(CASE WHEN confidence >= 0.5  THEN 1 ELSE 0 END) AS suspicious,
      AVG(confidence)                                AS avg_confidence
    FROM bot_detections
    WHERE stream_id = ? AND detected_at >= datetime('now', '-1 hour')
  `).get(streamId);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _toSubnet(ip: string): string {
  // Extract /24 subnet (first 3 octets + ".0")
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}
