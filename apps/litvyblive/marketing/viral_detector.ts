/**
 * Viral Detector — GhostBrain signal engine that identifies trending creators.
 *
 * Signals evaluated:
 *   • viewer growth rate  > 200 % in 10 min    → viral
 *   • gift GST spike      > 10,000 GST / 5 min → gift_spike
 *   • chat activity       > 500 msgs / 5 min   → chat_burst
 *   • follower gain       > 500 / hour         → follower_surge
 *
 * A creator who crosses ANY signal threshold is marked "trending" and
 * forwarded to the CampaignManager for automated promotion.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from '../backend/src/db/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViralSignal =
  | 'viewer_growth'
  | 'gift_spike'
  | 'chat_burst'
  | 'follower_surge';

export interface ViralEvent {
  event_id:   string;
  creator_id: string;
  signal:     ViralSignal;
  value:      number;    // raw metric value that triggered detection
  threshold:  number;
  detected_at: string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export const SIGNAL_THRESHOLDS: Record<ViralSignal, number> = {
  viewer_growth:   200,   // percent increase in 10 min
  gift_spike:      10_000, // GST gifted in 5 min
  chat_burst:      500,   // chat messages in 5 min
  follower_surge:  500,   // new followers in 1 hour
};

// ── Core detection ────────────────────────────────────────────────────────────

/**
 * Record a raw metric snapshot and evaluate whether it crosses a viral
 * threshold.  Returns the ViralEvent if triggered, null otherwise.
 */
export async function evaluateSignal(
  creatorId: string,
  signal: ViralSignal,
  value: number
): Promise<ViralEvent | null> {
  const threshold = SIGNAL_THRESHOLDS[signal];
  if (value < threshold) return null;

  const db = getDb();
  const eventId = uuid();
  const detectedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO viral_events
      (event_id, creator_id, signal, value, threshold, detected_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(eventId, creatorId, signal, value, threshold, detectedAt);

  // Mark creator as currently trending
  db.prepare(`
    INSERT INTO trending_creators (creator_id, signal, score, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(creator_id) DO UPDATE SET
      signal     = excluded.signal,
      score      = score + excluded.score,
      updated_at = excluded.updated_at
  `).run(creatorId, signal, value, detectedAt);

  return { event_id: eventId, creator_id: creatorId, signal, value, threshold, detected_at: detectedAt };
}

/**
 * Sweep all active live streams and evaluate a named signal for each.
 * In production this is called by a cron every minute.
 */
export async function sweepSignal(
  signal: ViralSignal,
  snapshotFn: () => Array<{ creatorId: string; value: number }> | Promise<Array<{ creatorId: string; value: number }>>
): Promise<ViralEvent[]> {
  const snapshots = await snapshotFn();
  const events: ViralEvent[] = [];
  for (const { creatorId, value } of snapshots) {
    const evt = await evaluateSignal(creatorId, signal, value);
    if (evt) events.push(evt);
  }
  return events;
}

/** Return the current trending creators ordered by composite score. */
export function getTrendingCreators(limit = 20): Array<{
  creator_id: string;
  signal: ViralSignal;
  score: number;
  updated_at: string;
}> {
  const db = getDb();
  return db.prepare(`
    SELECT creator_id, signal, score, updated_at
    FROM   trending_creators
    WHERE  updated_at >= datetime('now', '-1 hour')
    ORDER  BY score DESC
    LIMIT  ?
  `).all(limit) as any;
}

/** Clear stale trending entries older than `windowMinutes`. */
export function expireTrending(windowMinutes = 60): number {
  const db = getDb();
  const info = db.prepare(`
    DELETE FROM trending_creators
    WHERE updated_at < datetime('now', '-' || ? || ' minutes')
  `).run(windowMinutes);
  return info.changes;
}

/** Recent viral events for a creator. */
export function getViralEvents(creatorId: string, limit = 50): ViralEvent[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM viral_events
    WHERE  creator_id = ?
    ORDER  BY detected_at DESC
    LIMIT  ?
  `).all(creatorId, limit) as ViralEvent[];
}
