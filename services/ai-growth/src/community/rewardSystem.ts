/**
 * RewardSystem — manages community reward tiers and GST distribution
 * for engagement, content creation, and bug reports.
 */

import logger from "../utils/logger";

export interface RewardTier {
  name:       string;
  minPoints:  number;
  gstReward:  number;
  perks:      string[];
}

export interface UserReward {
  wallet:      string;
  points:      number;
  tier:        string;
  gstClaimed:  number;
  gstPending:  number;
  updatedAt:   string;
}

const TIERS: RewardTier[] = [
  { name: "Ghost Newbie",   minPoints: 0,    gstReward: 5,    perks: ["Discord role"] },
  { name: "Ghost Explorer", minPoints: 100,  gstReward: 50,   perks: ["Discord role", "Early access"] },
  { name: "Ghost Builder",  minPoints: 500,  gstReward: 200,  perks: ["Discord role", "Grant eligibility"] },
  { name: "Ghost Legend",   minPoints: 2000, gstReward: 1000, perks: ["Council access", "Advisory board invite", "GST airdrop"] },
];

const userRewards: Map<string, UserReward> = new Map();

function getTier(points: number): RewardTier {
  return [...TIERS].reverse().find(t => points >= t.minPoints) ?? TIERS[0];
}

export function addPoints(wallet: string, pts: number, reason: string): UserReward {
  const existing = userRewards.get(wallet) ?? {
    wallet,
    points:     0,
    tier:       TIERS[0].name,
    gstClaimed: 0,
    gstPending: 0,
    updatedAt:  new Date().toISOString(),
  };

  existing.points  += pts;
  const tier        = getTier(existing.points);
  existing.tier     = tier.name;
  existing.gstPending += pts * 0.5; // 0.5 GST per point
  existing.updatedAt  = new Date().toISOString();

  userRewards.set(wallet, existing);
  logger.info(`RewardSystem: +${pts} pts (${reason}) → ${wallet.slice(0, 10)}… tier=${existing.tier}`);
  return existing;
}

export function claimRewards(wallet: string): { claimed: number } {
  const user = userRewards.get(wallet);
  if (!user || user.gstPending === 0) return { claimed: 0 };

  const claimed     = user.gstPending;
  user.gstClaimed  += claimed;
  user.gstPending   = 0;
  user.updatedAt    = new Date().toISOString();
  logger.info(`RewardSystem: ${wallet.slice(0, 10)}… claimed ${claimed} GST`);
  return { claimed };
}

export function getLeaderboard(limit = 20): UserReward[] {
  return [...userRewards.values()]
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

export function getTiers(): RewardTier[] {
  return TIERS;
}
