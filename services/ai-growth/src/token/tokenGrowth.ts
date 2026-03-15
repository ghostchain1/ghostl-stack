/**
 * TokenGrowth — monitors GST volume and adjusts marketing spend to
 * capitalise on momentum.
 */

import axios from "axios";
import logger from "../utils/logger";

export interface TokenMetrics {
  price:       number; // USD
  volume24h:   number; // USD
  marketCap:   number; // USD
  change24h:   number; // %
  momentum:    "rising" | "flat" | "falling";
  updatedAt:   string;
}

let metrics: TokenMetrics = {
  price:     0.85,
  volume24h: 2_500_000,
  marketCap: 85_000_000,
  change24h: 4.2,
  momentum:  "rising",
  updatedAt: new Date().toISOString(),
};

export async function fetchTokenMetrics(): Promise<TokenMetrics> {
  const url = process.env.GHOST_ECONOMY_URL ?? "http://localhost:9980";
  try {
    const { data } = await axios.get(`${url}/token/gst/metrics`, { timeout: 5_000 });
    metrics = {
      price:     data.priceUsd   ?? metrics.price,
      volume24h: data.volume24h  ?? metrics.volume24h,
      marketCap: data.marketCap  ?? metrics.marketCap,
      change24h: data.change24h  ?? metrics.change24h,
      momentum:  data.change24h > 2 ? "rising" : data.change24h < -2 ? "falling" : "flat",
      updatedAt: new Date().toISOString(),
    };
  } catch {
    // simulate drift
    const drift = (Math.random() - 0.45) * 0.05;
    metrics.price    = Math.max(0.01, metrics.price * (1 + drift));
    metrics.change24h = drift * 100;
    metrics.momentum  = drift > 0.01 ? "rising" : drift < -0.01 ? "falling" : "flat";
    metrics.updatedAt = new Date().toISOString();
  }
  return metrics;
}

export async function optimizeTokenDemand(): Promise<{ action: string; reason: string }> {
  const m = await fetchTokenMetrics();

  if (m.momentum === "rising") {
    logger.info("TokenGrowth: volume rising → amplify marketing spend");
    return { action: "increase_marketing_budget", reason: `Volume +${m.change24h.toFixed(1)}% — amplify now` };
  }

  if (m.momentum === "falling") {
    logger.info("TokenGrowth: volume falling → increase community incentives");
    return { action: "launch_community_incentives", reason: `Volume -${Math.abs(m.change24h).toFixed(1)}% — stabilise` };
  }

  return { action: "maintain", reason: "Metrics stable" };
}

export function getMetrics(): TokenMetrics {
  return metrics;
}
