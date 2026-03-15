/**
 * League Manager — seasonal competitive rankings for creators.
 *
 * Creators are assigned to one of 5 leagues (Bronze → Legend) and move up/down
 * each season based on their performance score.  Promotion/relegation windows
 * are opened and closed by platform admin at end of season.
 *
 * League tables are stored in `league_seasons` and `league_standings` SQLite tables.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';
import { topCreators, aggregateMetrics } from './creator_metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeagueTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'legend';

export const LEAGUE_ORDER: LeagueTier[] = ['bronze', 'silver', 'gold', 'diamond', 'legend'];

/** Tier above the given one, or the same if already at the top. */
export function tierUp(tier: LeagueTier): LeagueTier {
  const i = LEAGUE_ORDER.indexOf(tier);
  return LEAGUE_ORDER[Math.min(i + 1, LEAGUE_ORDER.length - 1)];
}

/** Tier below the given one, or the same if already at the bottom. */
export function tierDown(tier: LeagueTier): LeagueTier {
  const i = LEAGUE_ORDER.indexOf(tier);
  return LEAGUE_ORDER[Math.max(i - 1, 0)];
}

export interface LeagueSeason {
  season_id:   string;
  season_name: string;    // e.g. 'Season 3 – Q1 2026'
  starts_at:   string;
  ends_at:     string;
  status:      'active' | 'closed';
}

export interface LeagueStanding {
  standing_id: string;
  season_id:   string;
  creator_id:  string;
  league_tier: LeagueTier;
  rank_in_tier: number;
  score:       number;
  promoted:    boolean;
  relegated:   boolean;
  updated_at:  string;
}

// ── Season management ──────────────────────────────────────────────────────────

export function openSeason(seasonName: string, startsAt: string, endsAt: string): LeagueSeason {
  const db  = getDb();
  const id  = uuid();

  db.prepare(`
    INSERT INTO league_seasons (season_id, season_name, starts_at, ends_at, status)
    VALUES (?, ?, ?, ?, 'active')
  `).run(id, seasonName, startsAt, endsAt);

  return { season_id: id, season_name: seasonName, starts_at: startsAt, ends_at: endsAt, status: 'active' };
}

export function closeSeason(seasonId: string): void {
  getDb().prepare(`UPDATE league_seasons SET status = 'closed' WHERE season_id = ?`).run(seasonId);
}

export function getActiveSeason(): LeagueSeason | null {
  return getDb().prepare(`
    SELECT * FROM league_seasons WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1
  `).get() as LeagueSeason | null;
}

export function getSeason(seasonId: string): LeagueSeason | null {
  return getDb().prepare(`SELECT * FROM league_seasons WHERE season_id = ?`).get(seasonId) as LeagueSeason | null;
}

// ── Standings ─────────────────────────────────────────────────────────────────

/**
 * Upsert a creator's standing for the current season.
 * Call this whenever metrics are refreshed.
 */
export function upsertStanding(seasonId: string, creatorId: string, tier: LeagueTier, score: number): LeagueStanding {
  const db  = getDb();
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT * FROM league_standings WHERE season_id = ? AND creator_id = ?
  `).get(seasonId, creatorId) as LeagueStanding | undefined;

  if (existing) {
    db.prepare(`
      UPDATE league_standings SET league_tier = ?, score = ?, updated_at = ?
      WHERE season_id = ? AND creator_id = ?
    `).run(tier, score, now, seasonId, creatorId);
    return { ...existing, league_tier: tier, score, updated_at: now };
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO league_standings
      (standing_id, season_id, creator_id, league_tier, rank_in_tier, score, promoted, relegated, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, 0, 0, ?)
  `).run(id, seasonId, creatorId, tier, score, now);

  return { standing_id: id, season_id: seasonId, creator_id: creatorId,
           league_tier: tier, rank_in_tier: 0, score, promoted: false,
           relegated: false, updated_at: now };
}

/**
 * Recompute all standings for the active season from fresh metrics.
 * Should be called nightly by the economy scheduler.
 */
export function refreshStandings(): void {
  const season = getActiveSeason();
  if (!season) return;

  const tops = topCreators('weekly', 10_000);
  for (const c of tops) {
    const snap = aggregateMetrics(c.creator_id, 'weekly');
    const tier = resolveLeagueTier(snap.performance_score);
    upsertStanding(season.season_id, c.creator_id, tier, snap.performance_score);
  }
  recomputeRanks(season.season_id);
}

/** Derive league tier from weekly performance score. */
export function resolveLeagueTier(score: number): LeagueTier {
  if (score >= 10_000) return 'legend';
  if (score >= 4_000)  return 'diamond';
  if (score >= 1_500)  return 'gold';
  if (score >= 400)    return 'silver';
  return 'bronze';
}

/** Recompute rank_in_tier for every creator in a season. */
export function recomputeRanks(seasonId: string): void {
  const db = getDb();
  for (const tier of LEAGUE_ORDER) {
    const rows = db.prepare(`
      SELECT standing_id FROM league_standings
      WHERE season_id = ? AND league_tier = ?
      ORDER BY score DESC
    `).all(seasonId, tier) as Array<{ standing_id: string }>;

    const update = db.prepare(`UPDATE league_standings SET rank_in_tier = ? WHERE standing_id = ?`);
    const batch  = db.transaction(() => {
      rows.forEach((r, i) => update.run(i + 1, r.standing_id));
    });
    batch();
  }
}

/**
 * Run promotion/relegation at season end.
 *
 * Rules: top 10 per tier move up; bottom 10 per tier move down.
 * Legend top / Bronze bottom are unchanged.
 */
export function runPromotionRelegation(seasonId: string, promotionCount = 10): void {
  const db  = getDb();
  const now = new Date().toISOString();

  const updateTier = db.prepare(`
    UPDATE league_standings
    SET league_tier = ?, promoted = ?, relegated = ?, updated_at = ?
    WHERE standing_id = ?
  `);

  const batch = db.transaction(() => {
    for (const tier of LEAGUE_ORDER) {
      const rows = db.prepare(`
        SELECT standing_id, league_tier, rank_in_tier FROM league_standings
        WHERE season_id = ? AND league_tier = ?
        ORDER BY score DESC
      `).all(seasonId, tier) as Array<{ standing_id: string; league_tier: LeagueTier; rank_in_tier: number }>;

      rows.forEach((r, idx) => {
        const rank = idx + 1;
        // Top N promoted (not from Legend)
        if (rank <= promotionCount && tier !== 'legend') {
          updateTier.run(tierUp(tier), 1, 0, now, r.standing_id);
        }
        // Bottom N relegated (not from Bronze)
        else if (rank > rows.length - promotionCount && tier !== 'bronze') {
          updateTier.run(tierDown(tier), 0, 1, now, r.standing_id);
        }
      });
    }
  });
  batch();
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function getLeaderboard(seasonId: string, tier: LeagueTier, limit = 50): LeagueStanding[] {
  return getDb().prepare(`
    SELECT * FROM league_standings
    WHERE season_id = ? AND league_tier = ?
    ORDER BY rank_in_tier ASC LIMIT ?
  `).all(seasonId, tier, limit) as LeagueStanding[];
}

export function getCreatorStanding(seasonId: string, creatorId: string): LeagueStanding | null {
  return getDb().prepare(`
    SELECT * FROM league_standings WHERE season_id = ? AND creator_id = ?
  `).get(seasonId, creatorId) as LeagueStanding | null;
}

export function listSeasons(limit = 20): LeagueSeason[] {
  return getDb().prepare(`SELECT * FROM league_seasons ORDER BY starts_at DESC LIMIT ?`).all(limit) as LeagueSeason[];
}
