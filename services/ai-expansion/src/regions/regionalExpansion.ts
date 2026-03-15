/**
 * RegionalExpansion — runs localised marketing campaigns and recruits regional ambassadors.
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface Region {
  id:          string;
  name:        string;
  language:    string;
  targetKPIs:  { users: number; tvl: string; validators: number };
  currentKPIs: { users: number; tvl: string; validators: number };
  ambassadors: Ambassador[];
  campaigns:   RegionCampaign[];
  status:      "planning" | "active" | "optimising";
}

export interface Ambassador {
  handle:   string;
  platform: "twitter" | "telegram" | "discord" | "wechat";
  followers: number;
  reward:   string; // "500 GST/month"
  regionId: string;
}

export interface RegionCampaign {
  id:       string;
  regionId: string;
  platform: string;
  message:  string;
  reach:    number;
  createdAt:string;
}

export const REGIONS: Region[] = [
  {
    id: "asia",        name: "Asia Pacific", language: "zh/ko/ja",
    targetKPIs:  { users: 50000, tvl: "$10M",  validators: 50 },
    currentKPIs: { users: 8200,  tvl: "$1.3M", validators: 12 },
    ambassadors: [], campaigns: [], status: "active",
  },
  {
    id: "europe",      name: "Europe",       language: "en/de/fr",
    targetKPIs:  { users: 30000, tvl: "$8M",   validators: 30 },
    currentKPIs: { users: 4500,  tvl: "$800K", validators: 8 },
    ambassadors: [], campaigns: [], status: "active",
  },
  {
    id: "middle-east", name: "Middle East",  language: "ar",
    targetKPIs:  { users: 20000, tvl: "$5M",   validators: 20 },
    currentKPIs: { users: 1200,  tvl: "$250K", validators: 3 },
    ambassadors: [], campaigns: [], status: "planning",
  },
  {
    id: "latam",       name: "Latin America",language: "es/pt",
    targetKPIs:  { users: 25000, tvl: "$4M",   validators: 15 },
    currentKPIs: { users: 2100,  tvl: "$320K", validators: 4 },
    ambassadors: [], campaigns: [], status: "active",
  },
  {
    id: "africa",      name: "Africa",       language: "en/fr/sw",
    targetKPIs:  { users: 15000, tvl: "$2M",   validators: 10 },
    currentKPIs: { users: 600,   tvl: "$80K",  validators: 1 },
    ambassadors: [], campaigns: [], status: "planning",
  },
];

async function localizedMessage(region: Region): Promise<string> {
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You craft short localized blockchain marketing messages (2 sentences, in English but culturally relevant to the target region)." },
          { role: "user",   content: `Create a GhostChain marketing message for the ${region.name} region (language hint: ${region.language}). Emphasize low fees, fast transactions, and earning GST rewards.` },
        ],
        max_tokens: 100, temperature: 0.8,
      });
      return res.choices[0]?.message?.content?.trim() ?? fallbackMsg(region);
    } catch {
      return fallbackMsg(region);
    }
  }
  return fallbackMsg(region);
}

function fallbackMsg(r: Region): string {
  return `Join GhostChain in ${r.name} — ultra-fast transactions, near-zero fees, and earn GST rewards every day. Be part of the next blockchain revolution!`;
}

export async function expandRegion(regionId: string): Promise<RegionCampaign | null> {
  const region = REGIONS.find(r => r.id === regionId);
  if (!region) return null;

  const message = await localizedMessage(region);
  const campaign: RegionCampaign = {
    id:       `rc-${regionId}-${Date.now()}`,
    regionId: region.id,
    platform: "twitter",
    message,
    reach:    Math.floor(Math.random() * 5000) + 1000,
    createdAt:new Date().toISOString(),
  };

  region.campaigns.push(campaign);
  region.status = "active";
  region.currentKPIs.users += Math.floor(campaign.reach * 0.03);
  logger.info(`RegionalExpansion: campaign launched in ${region.name}`);
  return campaign;
}

export async function runRegionalTick(): Promise<RegionCampaign[]> {
  const results: RegionCampaign[] = [];
  for (const region of REGIONS) {
    const camp = await expandRegion(region.id);
    if (camp) results.push(camp);
  }
  return results;
}

export function getRegions(): Region[] { return REGIONS; }
