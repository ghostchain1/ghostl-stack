/**
 * Promotion System — GhostBrain-powered automatic creator promotion engine.
 *
 * Triggers:
 *   • viewer growth rate > threshold  → boost discovery
 *   • gift volume spike               → featured slot
 *   • fan engagement rate rise        → trending badge
 *
 * Promotion actions are logged to `promotion_events` and surfaced via the
 * discovery API so the frontend can adjust rankings and surface badges.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';
import { getLatestMetrics } from './creator_metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromotionTrigger =
  | 'viewer_growth'
  | 'gift_volume'
  | 'fan_engagement'
  | 'manual';

export type PromotionAction =
  | 'boost_discovery'
  | 'featured_slot'
  | 'trending_badge'
  | 'front_page'
  | 'collaboration_suggest';

export interface PromotionEvent {
  event_id:    string;
  creator_id:  string;
  trigger:     PromotionTrigger;
  action:      PromotionAction;
  score_delta: number;  // metric delta that fired the trigger
  expires_at:  string | null;
  active:      boolean;
  created_at:  string;
}

export interface PromotionConfig {
  viewer_growth_threshold:  number;  // weekly growth rate % to trigger viewer_growth
  gift_spike_threshold:     number;  // GST delta in a week to trigger gift_volume
  engagement_threshold:     number;  // followers_gained / week
  boost_duration_hours:     number;  // how long a boost lasts
}

const DEFAULT_CONFIG: PromotionConfig = {
  viewer_growth_threshold: 50,   // 50 % growth triggers boost
  gift_spike_threshold:    5_000, // 5,000 GST in gifts this week
  engagement_threshold:    200,  // 200 new followers in a week
  boost_duration_hours:    72,
};

// ── Evaluation ─────────────────────────────────────────────────────────────────

/**
 * Evaluate a creator's latest weekly metrics and fire promotion actions
 * if thresholds are exceeded.  Returns the list of new promotion events created.
 */
export function evaluateCreator(
  creatorId: string,
  config:    PromotionConfig = DEFAULT_CONFIG,
): PromotionEvent[] {
  const metrics = getLatestMetrics(creatorId, 'weekly');
  if (!metrics) return [];

  const events: PromotionEvent[] = [];
  const expiresAt = new Date(Date.now() + config.boost_duration_hours * 3_600_000).toISOString();

  // viewer growth
  const growthRate = metrics.viewer_count > 0
    ? (metrics.viewer_count / Math.max(metrics.viewer_count - 1, 1)) * 100
    : 0;
  if (growthRate >= config.viewer_growth_threshold) {
    events.push(_createEvent(creatorId, 'viewer_growth', 'boost_discovery', growthRate, expiresAt));
  }

  // gift volume spike
  if (metrics.gifts_received >= config.gift_spike_threshold) {
    events.push(_createEvent(creatorId, 'gift_volume', 'featured_slot', metrics.gifts_received, expiresAt));
  }

  // fan engagement
  if (metrics.followers_gained >= config.engagement_threshold) {
    events.push(_createEvent(creatorId, 'fan_engagement', 'trending_badge', metrics.followers_gained, expiresAt));
  }

  return events;
}

/** Run promotion evaluation for a list of creator IDs (batch nightly job). */
export function runBatchEvaluation(
  creatorIds: string[],
  config?:    PromotionConfig,
): { creator_id: string; events: PromotionEvent[] }[] {
  return creatorIds.map((id) => ({
    creator_id: id,
    events:     evaluateCreator(id, config),
  }));
}

/** Manually promote a creator (admin / GhostBrain override). */
export function manualPromote(
  creatorId: string,
  action:    PromotionAction,
  durationHours = 48,
): PromotionEvent {
  const expiresAt = new Date(Date.now() + durationHours * 3_600_000).toISOString();
  return _createEvent(creatorId, 'manual', action, 0, expiresAt);
}

// ── Expiry housekeeping ────────────────────────────────────────────────────────

/** Deactivate promotion events whose expiry time has passed. */
export function expirePromotions(): number {
  const db  = getDb();
  const now = new Date().toISOString();
  const info = db.prepare(`
    UPDATE promotion_events SET active = 0
    WHERE active = 1 AND expires_at IS NOT NULL AND expires_at < ?
  `).run(now);
  return info.changes;
}

// ── Queries ────────────────────────────────────────────────────────────────────

/** All currently active promotions for a creator. */
export function getActivePromotions(creatorId: string): PromotionEvent[] {
  const db  = getDb();
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM promotion_events
    WHERE creator_id = ? AND active = 1
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
  `).all(creatorId, now) as PromotionEvent[];
}

/** All creators with an active boost_discovery or front_page promotion — used by discovery API. */
export function getBoostedCreators(): Array<{ creator_id: string; action: PromotionAction }> {
  const db  = getDb();
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT DISTINCT creator_id, action FROM promotion_events
    WHERE active = 1
      AND action IN ('boost_discovery', 'front_page', 'featured_slot')
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
  `).all(now) as Array<{ creator_id: string; action: PromotionAction }>;
}

export function listPromotionHistory(creatorId: string, limit = 50): PromotionEvent[] {
  return getDb().prepare(`
    SELECT * FROM promotion_events WHERE creator_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(creatorId, limit) as PromotionEvent[];
}

// ── Internal ───────────────────────────────────────────────────────────────────

function _createEvent(
  creatorId:  string,
  trigger:    PromotionTrigger,
  action:     PromotionAction,
  scoreDelta: number,
  expiresAt:  string | null,
): PromotionEvent {
  const db  = getDb();
  const id  = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO promotion_events
      (event_id, creator_id, trigger, action, score_delta, expires_at, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, creatorId, trigger, action, scoreDelta, expiresAt, now);

  return { event_id: id, creator_id: creatorId, trigger, action,
           score_delta: scoreDelta, expires_at: expiresAt, active: true, created_at: now };
}
