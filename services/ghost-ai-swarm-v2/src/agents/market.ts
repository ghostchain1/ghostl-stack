/**
 * GhostMarket AI
 *
 * Monitors cross-chain price feeds, detects arbitrage opportunities,
 * and forecasts GST token economics — all within GhostChain ecosystem.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

const L1_RPC       = process.env.L1_RPC_URL   ?? "http://127.0.0.1:18545";
const L2_RPC       = process.env.L2_RPC_URL   ?? "http://127.0.0.1:7260";
const L3_RPC       = process.env.L3_RPC_URL   ?? "http://127.0.0.1:7270";
const GHOSTBRAIN   = process.env.GHOSTBRAIN_URL ?? "http://127.0.0.1:7900";

// Minimum spread (bps) worth flagging as arbitrage opportunity
const ARB_THRESHOLD_BPS = 50;

interface PriceFeed { chain: string; price: number; liquidity: number }

export class GhostMarketAgent extends BaseAgent {
  readonly role         = "market" as const;
  readonly name         = "GhostMarket AI";
  readonly description  = "Detects cross-chain arbitrage, monitors GST price feeds, forecasts token economics";
  readonly capabilities = [
    "detect-arbitrage", "forecast-economics",
    "price-feed-monitor", "liquidity-analysis",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "detect-arbitrage":  return this.detectArbitrage();
      case "forecast-economics": return this.forecastEconomics(task.payload);
      default:                  return this.detectArbitrage();
    }
  }

  private async detectArbitrage(): Promise<Record<string, unknown>> {
    const feeds = await Promise.allSettled([
      this.fetchPriceFeed(L1_RPC, "GhostChain-L1"),
      this.fetchPriceFeed(L2_RPC, "GhostL2"),
      this.fetchPriceFeed(L3_RPC, "GhostL3"),
    ]);

    const prices: PriceFeed[] = feeds
      .filter((f): f is PromiseFulfilledResult<PriceFeed> => f.status === "fulfilled")
      .map(f => f.value);

    if (prices.length < 2) {
      return { status: "insufficient-feeds", count: prices.length, note: "Need >=2 chains online" };
    }

    const opportunities: Array<{
      sell: string; buy: string; spreadBps: number; direction: string
    }> = [];

    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const a = prices[i]!;
        const b = prices[j]!;
        const mid = (a.price + b.price) / 2;
        if (mid === 0) continue;
        const spreadBps = Math.abs(a.price - b.price) / mid * 10_000;
        if (spreadBps >= ARB_THRESHOLD_BPS) {
          const [sell, buy] = a.price > b.price ? [a.chain, b.chain] : [b.chain, a.chain];
          opportunities.push({ sell, buy, spreadBps: Math.round(spreadBps), direction: `${sell} → ${buy}` });
        }
      }
    }

    if (opportunities.length > 0) {
      bus.publish("alert:anomaly", "market", {
        type: "arbitrage-opportunity",
        count: opportunities.length,
        top: opportunities[0],
      });
    }

    return {
      feeds:         prices,
      opportunities,
      arbThresholdBps: ARB_THRESHOLD_BPS,
      note:          "Opportunities require human review and routing via GhostXchange",
    };
  }

  private async forecastEconomics(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const horizon = Number(payload["horizonDays"] ?? 30);

    // Query GhostBrain for ML forecast
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(`${GHOSTBRAIN}/api/v1/forecast`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ asset: "GST", horizonDays: horizon }),
        signal:  ctrl.signal,
      });
      if (res.ok) {
        const forecast = await res.json();
        return { horizon, source: "ghostbrain-ml", forecast };
      }
    } catch { /* fallback */ }

    // Offline heuristic: random walk with slight upward drift
    const drift = 0.002;
    const vol   = 0.015;
    let price   = 1.0;
    const series = Array.from({ length: horizon }, (_, d) => {
      price *= 1 + drift + (Math.random() - 0.5) * vol * 2;
      return { day: d + 1, price: +price.toFixed(6) };
    });

    return {
      horizon,
      source:    "heuristic-offline",
      series,
      note:      "Offline heuristic forecast — connect GhostBrain for ML-based accuracy",
      disclaimer: "Not financial advice. Always validate via governance before acting.",
    };
  }

  private async fetchPriceFeed(rpc: string, chain: string): Promise<PriceFeed> {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4_000);
    const res = await fetch(rpc, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ghost_getGstPrice", params: [] }),
      signal:  ctrl.signal,
    });
    const body = await res.json() as { result?: { price: number; liquidity: number } };
    return {
      chain,
      price:     body.result?.price     ?? 0,
      liquidity: body.result?.liquidity ?? 0,
    };
  }
}
