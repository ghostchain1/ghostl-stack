/**
 * GhostChain Universal Identity — Reputation Engine
 *
 * Computes a composite reputation score for each user across the GhostStack:
 *
 *   score = gifts × 0.35 + followers × 0.25 + events_won × 0.20 + streams × 0.20
 *           + talent_bonus (up to 250)
 *
 * Tiers:
 *   ghost     ≥ 5000
 *   platinum  ≥ 2000
 *   gold      ≥  800
 *   silver    ≥  300
 *   bronze    <  300
 *
 * Scores are persisted in `reputation_snapshots` so GhostBrain and the
 * creator dashboard can read the latest value without recomputing.
 */

import type Database from 'better-sqlite3';

export type ReputationTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'ghost';

export interface ReputationScore {
  userId: string;
  totalScore: number;
  giftsScore: number;
  followersScore: number;
  eventsScore: number;
  streamsScore: number;
  tier: ReputationTier;
  badges: string[];
  computedAt: string;
}

// ─── Tier boundaries (highest first for early exit in deriveTier) ─────────────

const TIER_THRESHOLDS: Array<[ReputationTier, number]> = [
  ['ghost',    5000],
  ['platinum', 2000],
  ['gold',      800],
  ['silver',    300],
  ['bronze',      0],
];

function deriveTier(score: number): ReputationTier {
  for (const [tier, min] of TIER_THRESHOLDS) {
    if (score >= min) return tier;
  }
  return 'bronze';
}

function deriveBadges(score: ReputationScore): string[] {
  const badges: string[] = [];
  if (score.giftsScore     >= 150) badges.push('generous_ghost');
  if (score.followersScore >= 120) badges.push('community_star');
  if (score.eventsScore    >=  60) badges.push('event_champion');
  if (score.streamsScore   >= 120) badges.push('live_legend');
  if (score.totalScore     >= 5000) badges.push('ghost_legend');
  if (score.tier === 'platinum' || score.tier === 'ghost') badges.push('elite_creator');
  return badges;
}

// ─── Core computation ─────────────────────────────────────────────────────────

export function computeReputation(
  db: Database.Database,
  userId: string,
): ReputationScore {
  const userRow = db
    .prepare(
      'SELECT total_gifts, followers, talent_score FROM users WHERE id = ?',
    )
    .get(userId) as
    | { total_gifts: number; followers: number; talent_score: number }
    | undefined;

  const { cnt: streamCount } = db
    .prepare('SELECT COUNT(*) AS cnt FROM streams WHERE host_id = ?')
    .get(userId) as { cnt: number };

  const { cnt: eventWins } = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM   wallet_transactions
       WHERE  user_id = ? AND type = 'event_prize'`,
    )
    .get(userId) as { cnt: number };

  const gifts     = userRow?.total_gifts   ?? 0;
  const followers = userRow?.followers     ?? 0;
  const talent    = userRow?.talent_score  ?? 0;

  // Component scores (weighted contributions, capped before weighting)
  const giftsScore     = Math.round(Math.min(gifts     * 2, 500) * 0.35);
  const followersScore = Math.round(Math.min(followers * 1.5, 500) * 0.25);
  const eventsScore    = Math.round(Math.min(eventWins * 20, 300) * 0.20);
  const streamsScore   = Math.round(Math.min(streamCount * 10, 400) * 0.20);
  const talentBonus    = Math.round(Math.min(talent * 0.5, 250));

  const totalScore = giftsScore + followersScore + eventsScore + streamsScore + talentBonus;
  const tier    = deriveTier(totalScore);
  const computedAt = new Date().toISOString();

  const partial: ReputationScore = {
    userId,
    totalScore,
    giftsScore,
    followersScore,
    eventsScore,
    streamsScore,
    tier,
    badges: [],
    computedAt,
  };

  partial.badges = deriveBadges(partial);
  return partial;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export function saveReputation(
  db: Database.Database,
  score: ReputationScore,
): void {
  db.prepare(
    `INSERT INTO reputation_snapshots
       (user_id, total_score, tier, badges_json, computed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       total_score  = excluded.total_score,
       tier         = excluded.tier,
       badges_json  = excluded.badges_json,
       computed_at  = excluded.computed_at`,
  ).run(
    score.userId,
    score.totalScore,
    score.tier,
    JSON.stringify(score.badges),
    score.computedAt,
  );
}

export function getSavedReputation(
  db: Database.Database,
  userId: string,
): Omit<ReputationScore, 'giftsScore' | 'followersScore' | 'eventsScore' | 'streamsScore'> | null {
  const row = db
    .prepare(
      `SELECT user_id     AS userId,
              total_score AS totalScore,
              tier,
              badges_json AS badgesJson,
              computed_at AS computedAt
       FROM   reputation_snapshots
       WHERE  user_id = ?`,
    )
    .get(userId) as
    | {
        userId: string;
        totalScore: number;
        tier: ReputationTier;
        badgesJson: string;
        computedAt: string;
      }
    | undefined;

  if (!row) return null;

  let badges: string[] = [];
  try {
    badges = JSON.parse(row.badgesJson) as string[];
  } catch {
    badges = [];
  }

  return { userId: row.userId, totalScore: row.totalScore, tier: row.tier, badges, computedAt: row.computedAt };
}
