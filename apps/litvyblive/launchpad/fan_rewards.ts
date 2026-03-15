/**
 * Fan Rewards — tier-based rewards computed from fan token holdings.
 * Tiers unlock perks: VIP chat, exclusive streams, private community, governance.
 */

import { getDb } from '../backend/src/db/index.js';

// Tiers are defined in fan-token units (18-decimal amounts assumed stored as
// floating-point numbers in SQLite for simplicity — production should use BigInt).
export type FanTier = 'supporter' | 'fan' | 'vip' | 'elite' | 'legendary';

export interface FanHolding {
  user_id: string;
  token_id: string;
  amount: number;
  last_updated: string;
}

export interface FanRewardStatus {
  userId: string;
  tokenId: string;
  holding: number;
  tier: FanTier;
  perks: string[];
}

const TIER_THRESHOLDS: Record<FanTier, number> = {
  supporter: 0,       // holds any tokens
  fan:       100,     // 100+ fan tokens
  vip:       500,     // VIP chat badge, exclusive stream access
  elite:     2_000,   // early-access events, merch discounts
  legendary: 10_000,  // private community, governance power, honorary credits
};

const TIER_PERKS: Record<FanTier, string[]> = {
  supporter: ['Standard chat', 'Public stream access'],
  fan:       ['Fan badge', 'Priority chat queue'],
  vip:       ['VIP chat badge', 'Exclusive stream access', 'Fan token voting'],
  elite:     ['Elite badge', 'Early-access events', 'Creator merch discount', 'DAO proposals'],
  legendary: ['Legendary badge', 'Private community access', 'Honorary stream credits', 'Full DAO governance', 'Creator collab invites'],
};

/** Derive the tier for a given holding amount. */
export function computeTier(amount: number): FanTier {
  if (amount >= TIER_THRESHOLDS.legendary) return 'legendary';
  if (amount >= TIER_THRESHOLDS.elite)     return 'elite';
  if (amount >= TIER_THRESHOLDS.vip)       return 'vip';
  if (amount >= TIER_THRESHOLDS.fan)       return 'fan';
  return 'supporter';
}

/** Get the perks for a tier. */
export function getPerks(tier: FanTier): string[] {
  return TIER_PERKS[tier];
}

/** Fetch the fan reward status for a user toward a specific creator token. */
export function getFanRewardStatus(userId: string, tokenId: string): FanRewardStatus {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM fan_holdings WHERE user_id=? AND token_id=?')
    .get(userId, tokenId) as FanHolding | undefined;

  const amount = row?.amount ?? 0;
  const tier   = computeTier(amount);
  return {
    userId,
    tokenId,
    holding: amount,
    tier,
    perks: getPerks(tier),
  };
}

/** List all fan holdings for a user (across all creator tokens). */
export function listUserHoldings(userId: string): FanHolding[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM fan_holdings WHERE user_id=? AND amount>0 ORDER BY amount DESC')
    .all(userId) as FanHolding[];
}

/** Leaderboard — top fans for a given creator token. */
export function topFans(tokenId: string, limit = 20): Array<FanHolding & { tier: FanTier }> {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM fan_holdings WHERE token_id=? AND amount>0 ORDER BY amount DESC LIMIT ?')
    .all(tokenId, limit) as FanHolding[];
  return rows.map(r => ({ ...r, tier: computeTier(r.amount) }));
}

/** Verify if a user has VIP or higher access for a given creator token. */
export function hasVipAccess(userId: string, tokenId: string): boolean {
  const status = getFanRewardStatus(userId, tokenId);
  return TIER_THRESHOLDS[status.tier] >= TIER_THRESHOLDS.vip;
}

/** Verify if a user has DAO governance power (elite or legendary). */
export function hasGovPower(userId: string, tokenId: string): boolean {
  const status = getFanRewardStatus(userId, tokenId);
  return TIER_THRESHOLDS[status.tier] >= TIER_THRESHOLDS.elite;
}
