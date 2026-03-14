/**
 * ViralityScore — measures and ranks campaign virality in real time.
 */

import logger from "../utils/logger";

export interface ViralMetrics {
  campaignId: string;
  shares:     number;
  likes:      number;
  comments:   number;
  views:      number;
  score:      number;
  tier:       "mega" | "high" | "medium" | "low";
  updatedAt:  string;
}

const metrics: Map<string, ViralMetrics> = new Map();

export function calculateVirality(data: { campaignId: string; shares: number; likes: number; comments: number; views: number }): ViralMetrics {
  const score = (data.shares * 2) + data.likes + (data.comments * 3) + Math.floor(data.views / 100);
  const tier  = score > 10000 ? "mega" : score > 3000 ? "high" : score > 500 ? "medium" : "low";

  const m: ViralMetrics = { ...data, score, tier, updatedAt: new Date().toISOString() };
  metrics.set(data.campaignId, m);

  if (tier === "mega" || tier === "high") {
    logger.info(`ViralityScore: campaign ${data.campaignId} is ${tier.toUpperCase()} viral (score=${score})`);
  }

  return m;
}

export function rankCampaigns(): ViralMetrics[] {
  return [...metrics.values()].sort((a, b) => b.score - a.score);
}

export function getMetric(campaignId: string): ViralMetrics | undefined {
  return metrics.get(campaignId);
}
