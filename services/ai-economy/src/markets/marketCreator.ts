/**
 * MarketCreator — spins up new DeFi, NFT, prediction, and gaming market opportunities
 * on GhostL2/GhostL3 and tracks their TVL growth.
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export type MarketType = "defi" | "nft" | "prediction" | "gaming" | "rwa";

export interface Market {
  id:          string;
  name:        string;
  type:        MarketType;
  description: string;
  layer:       "GhostL2" | "GhostL3";
  tvl:         number; // USD
  status:      "proposed" | "building" | "live" | "deprecated";
  createdAt:   string;
}

const markets: Market[] = [
  { id: "m1", name: "GhostSwap AMM",       type: "defi",       description: "Uniswap v4 fork with GST/USDC, GST/ETH pools", layer: "GhostL2", tvl: 1_200_000, status: "live",     createdAt: "2025-01-15T00:00:00Z" },
  { id: "m2", name: "GhostLend",           type: "defi",       description: "Aave v3 fork — borrow/lend GST and majors",    layer: "GhostL2", tvl: 850_000,   status: "live",     createdAt: "2025-02-01T00:00:00Z" },
  { id: "m3", name: "GhostNFT Marketplace",type: "nft",        description: "OpenSea-style NFT marketplace on GhostL2",    layer: "GhostL2", tvl: 320_000,   status: "live",     createdAt: "2025-02-20T00:00:00Z" },
  { id: "m4", name: "GhostPredict",        type: "prediction", description: "Polymarket-style prediction markets",          layer: "GhostL2", tvl: 180_000,   status: "building", createdAt: "2025-03-01T00:00:00Z" },
  { id: "m5", name: "GhostArena",          type: "gaming",     description: "Blockchain gaming chain on GhostL3",          layer: "GhostL3", tvl: 95_000,    status: "building", createdAt: "2025-03-10T00:00:00Z" },
  { id: "m6", name: "GhostRWA",            type: "rwa",        description: "Real-world asset tokenisation platform",      layer: "GhostL2", tvl: 0,         status: "proposed", createdAt: "2025-04-01T00:00:00Z" },
];

async function generateMarketConcept(type: MarketType): Promise<string> {
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a DeFi product strategist. Generate a one-paragraph market concept description." },
          { role: "user",   content: `Create a compelling ${type} market concept for GhostChain L2/L3 that would attract users and generate TVL. Be specific about mechanics and incentive structure.` },
        ],
        max_tokens: 150, temperature: 0.8,
      });
      return res.choices[0]?.message?.content?.trim() ?? `New ${type} market on GhostChain with GST rewards and deep liquidity incentives.`;
    } catch {
      return `New ${type} market on GhostChain with GST rewards and deep liquidity incentives.`;
    }
  }
  return `New ${type} market on GhostChain with GST rewards and deep liquidity incentives.`;
}

export async function proposeMarket(type: MarketType): Promise<Market> {
  const description = await generateMarketConcept(type);
  const names: Record<MarketType, string> = {
    defi:       "Ghost DeFi Protocol",
    nft:        "Ghost NFT Hub",
    prediction: "Ghost Oracle Markets",
    gaming:     "Ghost GameFi Platform",
    rwa:        "Ghost RWA Vault",
  };

  const market: Market = {
    id:          `m${Date.now()}`,
    name:        names[type],
    type,
    description,
    layer:       type === "gaming" ? "GhostL3" : "GhostL2",
    tvl:         0,
    status:      "proposed",
    createdAt:   new Date().toISOString(),
  };

  markets.push(market);
  logger.info(`MarketCreator: proposed new ${type} market: ${market.name}`);
  return market;
}

export function tickMarketTVL(): void {
  for (const m of markets) {
    if (m.status === "live") {
      const growth = (Math.random() - 0.3) * 0.05; // -1.5% to +3.5%
      m.tvl = Math.max(0, m.tvl * (1 + growth));
    }
  }
}

export function getMarkets(): Market[] { return markets; }

export function getMarketSummary() {
  const live = markets.filter(m => m.status === "live");
  return {
    total:    markets.length,
    live:     live.length,
    totalTVL: live.reduce((s, m) => s + m.tvl, 0),
    markets:  markets,
  };
}
