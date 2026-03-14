/**
 * GrowthPredictor — ML-style growth forecasting based on campaign metrics.
 */

import { getSummary } from "./campaignAnalytics";
import logger from "../utils/logger";

export interface GrowthForecast {
  horizon:              string; // e.g. "30d"
  predictedNewUsers:    number;
  predictedLiquidity:   number; // USD
  predictedTokenDemand: number; // % increase
  confidence:           number; // 0-100
  bestChannel:          string;
  expectedROI:          number; // %
  generatedAt:          string;
}

// Simple linear model — in production replace with real ML
export async function predictGrowth(horizonDays = 30): Promise<GrowthForecast> {
  const summary = getSummary();
  logger.info("GrowthPredictor: generating forecast");

  const dailyConversions  = summary.totalConversions / 7; // assume 7 days of data
  const growthFactor      = 1 + (summary.avgRoi / 1000);

  return {
    horizon:              `${horizonDays}d`,
    predictedNewUsers:    Math.round(dailyConversions * horizonDays * growthFactor),
    predictedLiquidity:   Math.round(summary.totalSpend * 12 * growthFactor),
    predictedTokenDemand: Math.round(summary.avgRoi * 0.15),
    confidence:           Math.min(95, 60 + summary.activeCampaigns * 5),
    bestChannel:          "YouTube",
    expectedROI:          Math.round(summary.avgRoi * growthFactor),
    generatedAt:          new Date().toISOString(),
  };
}
