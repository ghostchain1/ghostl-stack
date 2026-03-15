/**
 * ExchangeScanner — identifies exchanges suitable for GST listing.
 */

import logger from "../utils/logger";

export interface Exchange {
  id:         string;
  name:       string;
  tier:       1 | 2 | 3;
  volume24h:  number; // USD
  countries:  string[];
  listingFee: number; // USD
  status:     "identified" | "applied" | "under_review" | "listed" | "rejected";
  appliedAt?: string;
}

const EXCHANGES: Exchange[] = [
  { id: "ex-001", name: "Binance",    tier: 1, volume24h: 15_000_000_000, countries: ["Global"], listingFee: 500_000, status: "applied",      appliedAt: new Date(Date.now() - 86400_000 * 10).toISOString() },
  { id: "ex-002", name: "Coinbase",   tier: 1, volume24h: 4_000_000_000,  countries: ["US", "EU"], listingFee: 250_000, status: "under_review", appliedAt: new Date(Date.now() - 86400_000 * 5).toISOString() },
  { id: "ex-003", name: "Kraken",     tier: 1, volume24h: 2_500_000_000,  countries: ["US", "EU"], listingFee: 150_000, status: "identified",    },
  { id: "ex-004", name: "KuCoin",     tier: 2, volume24h: 1_800_000_000,  countries: ["Global"],   listingFee: 80_000,  status: "applied",      appliedAt: new Date(Date.now() - 86400_000 * 7).toISOString() },
  { id: "ex-005", name: "Gate.io",    tier: 2, volume24h: 1_200_000_000,  countries: ["Global"],   listingFee: 50_000,  status: "listed" },
  { id: "ex-006", name: "MEXC",       tier: 2, volume24h: 900_000_000,    countries: ["Global"],   listingFee: 30_000,  status: "listed" },
  { id: "ex-007", name: "Bybit",      tier: 2, volume24h: 2_200_000_000,  countries: ["Global"],   listingFee: 100_000, status: "applied",      appliedAt: new Date(Date.now() - 86400_000 * 3).toISOString() },
  { id: "ex-008", name: "OKX",        tier: 1, volume24h: 5_000_000_000,  countries: ["Global"],   listingFee: 300_000, status: "identified" },
];

export async function scanExchanges(): Promise<Exchange[]> {
  logger.info("ExchangeScanner: scanning exchange landscape");
  return [...EXCHANGES].sort((a, b) => b.volume24h - a.volume24h);
}

export function getExchanges(): Exchange[] {
  return EXCHANGES;
}

export function getListedCount(): number {
  return EXCHANGES.filter(e => e.status === "listed").length;
}
