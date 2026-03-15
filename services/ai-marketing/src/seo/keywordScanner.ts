/**
 * KeywordScanner — scans crypto search trends and identifies high-value
 * keywords for GhostChain SEO campaigns.
 */

import axios from "axios";
import logger from "../utils/logger";

export interface Keyword {
  term:       string;
  volume:     number; // estimated monthly searches
  difficulty: number; // 0-100, higher = harder
  relevance:  number; // 0-100 to GhostChain
  opportunity: "high" | "medium" | "low";
}

const SEED_KEYWORDS: Keyword[] = [
  { term: "GhostChain blockchain",          volume: 5200,  difficulty: 12, relevance: 100, opportunity: "high" },
  { term: "GhostChain L2",                  volume: 3100,  difficulty: 8,  relevance: 100, opportunity: "high" },
  { term: "GhostChain gas token",           volume: 2400,  difficulty: 6,  relevance: 100, opportunity: "high" },
  { term: "GhostChain DeFi",               volume: 4800,  difficulty: 15, relevance: 95,  opportunity: "high" },
  { term: "GhostChain exchange",            volume: 6100,  difficulty: 18, relevance: 90,  opportunity: "high" },
  { term: "GST token price",                volume: 8900,  difficulty: 22, relevance: 90,  opportunity: "high" },
  { term: "layer 2 blockchain low fees",    volume: 22000, difficulty: 55, relevance: 70,  opportunity: "medium" },
  { term: "best blockchain for developers", volume: 18000, difficulty: 48, relevance: 75,  opportunity: "medium" },
  { term: "crypto gas fees solution",       volume: 15000, difficulty: 42, relevance: 80,  opportunity: "medium" },
  { term: "fast blockchain 2026",           volume: 9500,  difficulty: 35, relevance: 65,  opportunity: "medium" },
  { term: "EVM compatible blockchain",      volume: 12000, difficulty: 50, relevance: 85,  opportunity: "medium" },
  { term: "blockchain defi yield farming",  volume: 35000, difficulty: 72, relevance: 60,  opportunity: "low" },
];

let cachedKeywords = [...SEED_KEYWORDS];
let lastScan: string | null = null;

export async function scanKeywords(): Promise<Keyword[]> {
  logger.info("KeywordScanner: running scan");

  // In production: integrate Google Keyword Planner API or Ahrefs API
  // For now: simulate volume drift and return enriched seed list
  cachedKeywords = cachedKeywords.map(k => ({
    ...k,
    volume: Math.max(100, k.volume + Math.floor((Math.random() - 0.4) * 500)),
  }));

  lastScan = new Date().toISOString();
  return cachedKeywords;
}

export function getTopKeywords(limit = 10): Keyword[] {
  return [...cachedKeywords]
    .sort((a, b) => (b.relevance * b.volume / (b.difficulty + 1)) - (a.relevance * a.volume / (a.difficulty + 1)))
    .slice(0, limit);
}

export function getLastScan(): string | null {
  return lastScan;
}

export function getAllKeywords(): Keyword[] {
  return cachedKeywords;
}
