/**
 * AirdropEngine — distributes GST tokens to top community contributors.
 * Ranks users by on-chain + off-chain activity and distributes rewards.
 */

import logger from "../utils/logger";

export interface AirdropUser {
  wallet:    string;
  activity:  number; // composite score
  gstAmount: number;
}

export interface AirdropRound {
  id:          string;
  totalGST:    number;
  recipients:  number;
  status:      "pending" | "distributed" | "failed";
  createdAt:   string;
  distributedAt?: string;
}

const airdropHistory: AirdropRound[] = [];

// Simulate fetching active users from chain + analytics
async function getActiveUsers(): Promise<AirdropUser[]> {
  // In production: query on-chain tx history + social activity DB
  return Array.from({ length: 50 }, (_, i) => ({
    wallet:   `0x${Math.random().toString(16).slice(2, 42).padStart(40, "0")}`,
    activity:  Math.floor(Math.random() * 1000),
    gstAmount: 0,
  }));
}

export async function runAirdrop(totalGST = 100_000, topN = 1000): Promise<AirdropRound> {
  logger.info(`AirdropEngine: starting airdrop — ${totalGST.toLocaleString()} GST to top ${topN} users`);

  const users   = await getActiveUsers();
  const winners = users
    .sort((a, b) => b.activity - a.activity)
    .slice(0, topN);

  const totalActivity = winners.reduce((s, u) => s + u.activity, 0);
  winners.forEach(u => {
    u.gstAmount = totalActivity > 0
      ? Math.round((u.activity / totalActivity) * totalGST)
      : Math.floor(totalGST / winners.length);
  });

  // In production: call Ghost treasury contract batch-transfer
  const round: AirdropRound = {
    id:           `airdrop-${Date.now()}`,
    totalGST,
    recipients:   winners.length,
    status:       "distributed",
    createdAt:    new Date().toISOString(),
    distributedAt: new Date().toISOString(),
  };

  airdropHistory.unshift(round);
  if (airdropHistory.length > 50) airdropHistory.pop();
  logger.info(`AirdropEngine: distributed ${totalGST.toLocaleString()} GST to ${winners.length} users`);
  return round;
}

export function getAirdropHistory(): AirdropRound[] {
  return airdropHistory;
}
