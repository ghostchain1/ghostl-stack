/**
 * SupplyController — monitors demand signals and adjusts GST emission rate
 * or triggers additional burns to maintain price stability.
 */

import { burnGST } from "./tokenBurnEngine";
import logger      from "../utils/logger";

export interface SupplyMetrics {
  circulatingSupply: number; // GST
  dailyEmissions:    number; // GST/day
  dailyDemand:       number; // GST/day — estimated from DEX volume
  pressureRatio:     number; // demand / supply (>1 = bullish)
  action:            "burn" | "reduce-emissions" | "hold" | "increase-emissions";
  lastUpdatedAt:     string;
}

let metrics: SupplyMetrics = {
  circulatingSupply: 500_000_000,
  dailyEmissions:    100_000,
  dailyDemand:       120_000,
  pressureRatio:     1.2,
  action:            "hold",
  lastUpdatedAt:     new Date().toISOString(),
};

export async function adjustSupply(): Promise<SupplyMetrics> {
  // Simulated demand signal — in production, pull from DEX volume API
  const demandShift = (Math.random() - 0.48) * 20_000;
  metrics.dailyDemand = Math.max(10_000, metrics.dailyDemand + demandShift);
  metrics.pressureRatio = metrics.dailyDemand / metrics.dailyEmissions;

  if (metrics.pressureRatio < 0.8) {
    // Supply exceeds demand → burn + reduce emissions
    metrics.action = "burn";
    metrics.dailyEmissions = Math.max(10_000, metrics.dailyEmissions * 0.9);
    await burnGST(50_000, "governance");
    logger.warn(`SupplyController: oversupply detected (ratio=${metrics.pressureRatio.toFixed(2)}) — burning 50K GST`);
  } else if (metrics.pressureRatio > 1.5) {
    // Strong demand → increase emissions to meet usage
    metrics.action = "increase-emissions";
    metrics.dailyEmissions = Math.min(500_000, metrics.dailyEmissions * 1.1);
    logger.info(`SupplyController: demand surge (ratio=${metrics.pressureRatio.toFixed(2)}) — increasing emissions`);
  } else if (metrics.pressureRatio > 1.2) {
    metrics.action = "reduce-emissions";
    metrics.dailyEmissions = Math.max(10_000, metrics.dailyEmissions * 0.95);
    logger.info(`SupplyController: mild surplus demand — slight emission reduction`);
  } else {
    metrics.action = "hold";
    logger.info(`SupplyController: supply balanced (ratio=${metrics.pressureRatio.toFixed(2)})`);
  }

  metrics.lastUpdatedAt = new Date().toISOString();
  return metrics;
}

export function getSupplyMetrics(): SupplyMetrics { return metrics; }
