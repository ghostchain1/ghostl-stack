/**
 * ViralCampaigns — orchestrates multi-platform viral campaign runs.
 */

import logger from "../utils/logger";

export interface ViralCampaign {
  id:          string;
  theme:       string;
  hashtags:    string[];
  platforms:   string[];
  status:      "draft" | "live" | "completed";
  startedAt:   string;
  endsAt:      string;
  reach:       number;
  engagement:  number;
  viralScore:  number;
}

const campaigns: ViralCampaign[] = [];

const CAMPAIGN_THEMES = [
  { theme: "GhostChain Gas Revolution",   hashtags: ["#GhostChain", "#GST", "#ZeroGas"] },
  { theme: "Ghost Developer Week",         hashtags: ["#BuildOnGhost", "#GhostChain", "#Web3Dev"] },
  { theme: "GST Staking Season",           hashtags: ["#GST", "#Staking", "#DeFi", "#GhostChain"] },
  { theme: "GhostXchange Launch Surge",    hashtags: ["#GhostXchange", "#DEX", "#DeFi", "#GST"] },
  { theme: "LitVyb Live Creator Economy",  hashtags: ["#LitVybLive", "#Web3Music", "#CreatorEconomy"] },
  { theme: "Ghost L3 AppChain Showcase",   hashtags: ["#GhostL3", "#AppChains", "#GhostChain"] },
];

export async function createCampaign(): Promise<ViralCampaign> {
  const template = CAMPAIGN_THEMES[Math.floor(Math.random() * CAMPAIGN_THEMES.length)];
  const now      = new Date();
  const ends     = new Date(now.getTime() + 72 * 3600_000); // 72h campaign

  const campaign: ViralCampaign = {
    id:         `vcmp-${Date.now()}`,
    theme:      template.theme,
    hashtags:   template.hashtags,
    platforms:  ["Twitter", "TikTok", "YouTube"],
    status:     "live",
    startedAt:  now.toISOString(),
    endsAt:     ends.toISOString(),
    reach:      0,
    engagement: 0,
    viralScore: Math.floor(Math.random() * 30 + 50),
  };

  campaigns.unshift(campaign);
  if (campaigns.length > 50) campaigns.pop();
  logger.info(`ViralCampaigns: launched campaign "${campaign.theme}"`);
  return campaign;
}

export function tickCampaigns(): void {
  const now = Date.now();
  campaigns.forEach(c => {
    if (c.status !== "live") return;
    if (new Date(c.endsAt).getTime() < now) {
      c.status = "completed";
      return;
    }
    c.reach      += Math.floor(Math.random() * 10_000);
    c.engagement += Math.floor(Math.random() * 500);
    c.viralScore  = Math.min(100, c.viralScore + Math.random() * 2 - 0.8);
  });
}

export function getCampaigns(): ViralCampaign[] {
  return campaigns;
}
