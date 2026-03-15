/**
 * Creator Metrics Engine — collects and aggregates live platform signals for
 * each creator:  viewer counts, gift volumes, follower gains, stream hours.
 *
 * Scores power the salary engine, league rankings, and the GhostBrain
 * promotion system.  All metrics are persisted to SQLite and recomputed on
 * every significant platform event.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetricSnapshot {
  snapshot_id:    string;
  creator_id:     string;
  period:         'daily' | 'weekly' | 'monthly';
  viewer_count:   number;
  gifts_received: number;  // total GST value of gifts this period
  followers_gained: number;
  stream_hours:   number;
  performance_score: number;  // computed composite
  recorded_at:    string;
}

export type CreatorTier = 'bronze' | 'silver' | 'gold' | 'elite';

export interface TierConfig {
  tier:            CreatorTier;
  min_score:       number;
  monthly_salary:  number;  // GST
  label:           string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Salary tiers keyed by tier name. */
export const TIER_CONFIG: Record<CreatorTier, TierConfig> = {
  bronze: { tier: 'bronze', min_score: 0,     monthly_salary: 1_000,  label: 'Bronze' },
  silver: { tier: 'silver', min_score: 500,   monthly_salary: 5_000,  label: 'Silver' },
  gold:   { tier: 'gold',   min_score: 2_000, monthly_salary: 15_000, label: 'Gold'   },
  elite:  { tier: 'elite',  min_score: 8_000, monthly_salary: 50_000, label: 'Elite'  },
};

/**
 * Score formula (matches spec):
 *   score = viewers×0.3 + gifts×0.4 + followers×0.2 + hours×0.1
 */
export function computeScore(
  viewerCount:    number,
  giftsReceived:  number,
  followersGained: number,
  streamHours:    number,
): number {
  return (
    viewerCount    * 0.3 +
    giftsReceived  * 0.4 +
    followersGained * 0.2 +
    streamHours    * 0.1
  );
}

/** Resolve tier from composite score. */
export function resolveCreatorTier(score: number): CreatorTier {
  if (score >= TIER_CONFIG.elite.min_score)  return 'elite';
  if (score >= TIER_CONFIG.gold.min_score)   return 'gold';
  if (score >= TIER_CONFIG.silver.min_score) return 'silver';
  return 'bronze';
}

// ── Persistence ────────────────────────────────────────────────────────────────

/** Record a metric snapshot for a creator period. */
export function recordMetrics(
  creatorId:      string,
  period:         MetricSnapshot['period'],
  viewerCount:    number,
  giftsReceived:  number,
  followersGained: number,
  streamHours:    number,
): MetricSnapshot {
  const db       = getDb();
  const id       = uuid();
  const score    = computeScore(viewerCount, giftsReceived, followersGained, streamHours);
  const now      = new Date().toISOString();

  db.prepare(`
    INSERT INTO creator_metrics
      (snapshot_id, creator_id, period, viewer_count, gifts_received,
       followers_gained, stream_hours, performance_score, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, creatorId, period, viewerCount, giftsReceived, followersGained, streamHours, score, now);

  return { snapshot_id: id, creator_id: creatorId, period, viewer_count: viewerCount,
           gifts_received: giftsReceived, followers_gained: followersGained,
           stream_hours: streamHours, performance_score: score, recorded_at: now };
}

/** Latest snapshot per period for a creator. */
export function getLatestMetrics(creatorId: string, period: MetricSnapshot['period']): MetricSnapshot | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM creator_metrics
    WHERE creator_id = ? AND period = ?
    ORDER BY recorded_at DESC LIMIT 1
  `).get(creatorId, period) as MetricSnapshot | undefined;
  return row ?? null;
}

/** Aggregate totals for a creator across all snapshots of a period. */
export function aggregateMetrics(creatorId: string, period: MetricSnapshot['period']): MetricSnapshot {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      SUM(viewer_count)    AS viewer_count,
      SUM(gifts_received)  AS gifts_received,
      SUM(followers_gained) AS followers_gained,
      SUM(stream_hours)    AS stream_hours,
      MAX(recorded_at)     AS recorded_at
    FROM creator_metrics
    WHERE creator_id = ? AND period = ?
  `).get(creatorId, period) as {
    viewer_count: number; gifts_received: number;
    followers_gained: number; stream_hours: number; recorded_at: string;
  };

  const vc = row.viewer_count    ?? 0;
  const gr = row.gifts_received  ?? 0;
  const fg = row.followers_gained ?? 0;
  const sh = row.stream_hours    ?? 0;

  return {
    snapshot_id: 'aggregate',
    creator_id:  creatorId,
    period,
    viewer_count:     vc,
    gifts_received:   gr,
    followers_gained: fg,
    stream_hours:     sh,
    performance_score: computeScore(vc, gr, fg, sh),
    recorded_at:       row.recorded_at ?? new Date().toISOString(),
  };
}

/** Top N creators by performance score within a period. */
export function topCreators(
  period: MetricSnapshot['period'],
  limit = 50,
): Array<{ creator_id: string; performance_score: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT creator_id, MAX(performance_score) AS performance_score
    FROM creator_metrics
    WHERE period = ?
    GROUP BY creator_id
    ORDER BY performance_score DESC
    LIMIT ?
  `).all(period, limit) as Array<{ creator_id: string; performance_score: number }>;
}
