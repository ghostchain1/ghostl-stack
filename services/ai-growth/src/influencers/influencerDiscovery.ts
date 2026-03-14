/**
 * InfluencerDiscovery — scans social platforms for high-potential crypto influencers
 * to partner with on GhostChain campaigns.
 */

import logger from "../utils/logger";

export interface Influencer {
  id:          string;
  name:        string;
  platform:    string;
  handle:      string;
  followers:   number;
  engagement:  number; // %
  relevance:   number; // 0-100
  score:       number;
  niche:       string;
  contactEmail?: string;
}

// In production: integrate Twitter API v2, YouTube Data API, TikTok Research API
const POOL: Influencer[] = [
  { id: "gid-001", name: "CryptoShadow",    platform: "Twitter",  handle: "@CryptoShadow",   followers: 250_000, engagement: 5.2, relevance: 85, score: 0, niche: "DeFi & L2" },
  { id: "gid-002", name: "BlockBoss",       platform: "YouTube",  handle: "BlockBossYT",     followers: 480_000, engagement: 4.1, relevance: 78, score: 0, niche: "Blockchain education" },
  { id: "gid-003", name: "GhostFan99",      platform: "Twitter",  handle: "@GhostFan99",     followers: 28_000,  engagement: 9.8, relevance: 99, score: 0, niche: "GhostChain community" },
  { id: "gid-004", name: "TikCrypto",       platform: "TikTok",   handle: "@TikCrypto",      followers: 890_000, engagement: 7.3, relevance: 70, score: 0, niche: "Crypto for beginners" },
  { id: "gid-005", name: "DeFiDoctrine",    platform: "Podcast",  handle: "DeFiDocPod",      followers: 65_000,  engagement: 8.5, relevance: 80, score: 0, niche: "DeFi deep dives" },
  { id: "gid-006", name: "SolVaultLuis",    platform: "Twitter",  handle: "@SolVaultLuis",   followers: 145_000, engagement: 3.9, relevance: 62, score: 0, niche: "Multi-chain DeFi" },
  { id: "gid-007", name: "L2MaximalistMae", platform: "Twitter",  handle: "@L2MaxMae",       followers: 94_000,  engagement: 6.1, relevance: 88, score: 0, niche: "L2 scaling" },
  { id: "gid-008", name: "Web3NativaSOL",   platform: "YouTube",  handle: "Web3NativaSOL",   followers: 210_000, engagement: 5.5, relevance: 65, score: 0, niche: "Web3 tutorials" },
];

function scoreInfluencer(i: Influencer): number {
  return Math.round((i.followers / 1000) * (i.engagement / 10) * (i.relevance / 100) * 10);
}

export async function discoverInfluencers(minFollowers = 100_000): Promise<Influencer[]> {
  logger.info("InfluencerDiscovery: scanning platforms");
  return POOL
    .filter(i => i.followers >= minFollowers)
    .map(i => ({ ...i, score: scoreInfluencer(i) }))
    .sort((a, b) => b.score - a.score);
}

export function getAllInfluencers(): Influencer[] {
  return POOL.map(i => ({ ...i, score: scoreInfluencer(i) }));
}
