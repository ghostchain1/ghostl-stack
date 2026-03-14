/**
 * InfluencerScanner — discovers crypto influencers across platforms.
 * Scores them by a composite followers × engagement × relevance formula.
 */

import logger from "../utils/logger";

export interface Influencer {
  id:          string;
  name:        string;
  platform:    "Twitter" | "YouTube" | "TikTok" | "Telegram" | "Podcast";
  handle:      string;
  followers:   number;
  engagement:  number; // engagement rate %
  relevance:   number; // 0-100 relevance to crypto/GhostChain
  score:       number;
  contacted:   boolean;
  contactedAt?: string;
}

// Seeded synthetic influencer pool — in production query platform APIs
const INFLUENCER_POOL: Influencer[] = [
  { id: "inf-001", name: "CryptoVortex",      platform: "Twitter",  handle: "@CryptoVortex",     followers: 180_000, engagement: 4.2, relevance: 88, score: 0, contacted: false },
  { id: "inf-002", name: "BlockchainBen",     platform: "YouTube",  handle: "BlockchainBenYT",   followers: 320_000, engagement: 3.8, relevance: 82, score: 0, contacted: false },
  { id: "inf-003", name: "DefiDynasty",       platform: "Twitter",  handle: "@DefiDynasty",      followers: 95_000,  engagement: 6.1, relevance: 91, score: 0, contacted: false },
  { id: "inf-004", name: "LayerZeroLisa",     platform: "TikTok",   handle: "@LayerZeroLisa",    followers: 210_000, engagement: 8.4, relevance: 75, score: 0, contacted: false },
  { id: "inf-005", name: "GhostNation",       platform: "Telegram", handle: "t.me/GhostNation",  followers: 55_000,  engagement: 5.2, relevance: 99, score: 0, contacted: false },
  { id: "inf-006", name: "CryptoCallsPod",    platform: "Podcast",  handle: "CryptoCalls",       followers: 42_000,  engagement: 9.3, relevance: 70, score: 0, contacted: false },
  { id: "inf-007", name: "Web3Wizardess",     platform: "Twitter",  handle: "@Web3Wizardess",    followers: 130_000, engagement: 5.7, relevance: 80, score: 0, contacted: false },
  { id: "inf-008", name: "DotExeDeGen",       platform: "TikTok",   handle: "@DotExeDeGen",      followers: 440_000, engagement: 7.2, relevance: 65, score: 0, contacted: false },
];

// Score = followers × engagement × relevance (normalised)
function score(inf: Influencer): number {
  return Math.round((inf.followers / 1000) * inf.engagement * (inf.relevance / 100));
}

export async function findInfluencers(
  minFollowers = 50_000,
  minRelevance = 60,
): Promise<Influencer[]> {
  logger.info("InfluencerScanner: scanning platforms");

  // In production: call Twitter API, YouTube Data API, TikTok API
  const results = INFLUENCER_POOL
    .filter(i => i.followers >= minFollowers && i.relevance >= minRelevance)
    .map(i => ({ ...i, score: score(i) }))
    .sort((a, b) => b.score - a.score);

  logger.info(`InfluencerScanner: found ${results.length} candidates`);
  return results;
}

export function getAllInfluencers(): Influencer[] {
  return INFLUENCER_POOL.map(i => ({ ...i, score: score(i) }));
}

export function markContacted(id: string): void {
  const inf = INFLUENCER_POOL.find(i => i.id === id);
  if (inf) {
    inf.contacted   = true;
    inf.contactedAt = new Date().toISOString();
  }
}
