/**
 * CampaignAnalytics — tracks performance of all active campaigns.
 */

import logger from "../utils/logger";

export interface CampaignMetrics {
  campaignId:   string;
  name:         string;
  channel:      string;
  impressions:  number;
  clicks:       number;
  conversions:  number;
  ctr:          number;
  cpa:          number;  // cost per acquisition USD
  spend:        number;  // USD
  roi:          number;  // %
  status:       "active" | "paused" | "completed";
  startedAt:    string;
  updatedAt:    string;
}

const campaigns: CampaignMetrics[] = [
  {
    campaignId: "cmp-001", name: "GhostChain Developer Adoption", channel: "Twitter",
    impressions: 145_000, clicks: 5800, conversions: 290, ctr: 4.0, cpa: 12.50, spend: 3625, roi: 210,
    status: "active", startedAt: new Date(Date.now() - 86400_000 * 3).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    campaignId: "cmp-002", name: "GST Token Awareness", channel: "Reddit",
    impressions: 88_000, clicks: 2640, conversions: 132, ctr: 3.0, cpa: 8.75, spend: 1155, roi: 185,
    status: "active", startedAt: new Date(Date.now() - 86400_000 * 5).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    campaignId: "cmp-003", name: "GhostXchange Liquidity Drive", channel: "YouTube",
    impressions: 220_000, clicks: 11_000, conversions: 550, ctr: 5.0, cpa: 9.10, spend: 5005, roi: 310,
    status: "active", startedAt: new Date(Date.now() - 86400_000 * 7).toISOString(), updatedAt: new Date().toISOString(),
  },
];

export function refreshMetrics(): void {
  campaigns.forEach(c => {
    c.impressions  += Math.floor(Math.random() * 5000);
    c.clicks       += Math.floor(Math.random() * 200);
    c.conversions  += Math.floor(Math.random() * 10);
    c.ctr           = (c.clicks / c.impressions) * 100;
    c.spend        += Math.random() * 100;
    c.roi           = ((c.conversions * 100 - c.spend) / c.spend) * 100;
    c.updatedAt     = new Date().toISOString();
  });
  logger.info("CampaignAnalytics: metrics refreshed");
}

export function getCampaigns(): CampaignMetrics[] {
  return campaigns;
}

export function getSummary() {
  const active = campaigns.filter(c => c.status === "active");
  return {
    activeCampaigns: active.length,
    totalImpressions: active.reduce((s, c) => s + c.impressions, 0),
    totalClicks:      active.reduce((s, c) => s + c.clicks, 0),
    totalConversions: active.reduce((s, c) => s + c.conversions, 0),
    totalSpend:       active.reduce((s, c) => s + c.spend, 0),
    avgRoi:           active.length ? active.reduce((s, c) => s + c.roi, 0) / active.length : 0,
  };
}
