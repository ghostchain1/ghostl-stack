/**
 * GoogleAdsAI — AI-managed Google Ads campaigns for GhostChain.
 * Simulates creation/optimisation when credentials are absent.
 */

import logger from "../utils/logger";

export interface AdVariant {
  id:         string;
  headline:   string;
  description: string;
  ctr:        number; // click-through rate %
  budget:     number; // USD/day
  status:     "active" | "paused" | "killed";
  createdAt:  string;
}

const variants: AdVariant[] = [
  { id: "gads-001", headline: "Build on GhostChain L1",           description: "EVM-compatible, sub-second finality. Deploy today.",      ctr: 3.2, budget: 50,  status: "active",  createdAt: new Date().toISOString() },
  { id: "gads-002", headline: "Trade GST on GhostXchange",        description: "Zero-fee swaps. Native DEX for the Ghost ecosystem.",    ctr: 5.8, budget: 75,  status: "active",  createdAt: new Date().toISOString() },
  { id: "gads-003", headline: "GhostL2 — 10× Faster Blockchain",  description: "Scale without compromise. Powered by GST gas token.",    ctr: 1.1, budget: 30,  status: "paused",  createdAt: new Date().toISOString() },
  { id: "gads-004", headline: "Earn Yield in the Ghost Ecosystem", description: "Stake GST, provide liquidity, earn passive income.",     ctr: 8.4, budget: 100, status: "active",  createdAt: new Date().toISOString() },
];

const CTR_KILL_THRESHOLD    = 2.0;  // below this → kill ad
const CTR_BOOST_THRESHOLD   = 8.0;  // above this → +300% budget
const MAX_BUDGET_PER_AD_USD = 500;

export async function optimiseAds(): Promise<AdVariant[]> {
  logger.info("GoogleAdsAI: running optimisation cycle");

  variants.forEach(ad => {
    // Simulate CTR drift
    ad.ctr = Math.max(0, ad.ctr + (Math.random() - 0.45) * 0.5);

    if (ad.ctr < CTR_KILL_THRESHOLD) {
      ad.status = "killed";
      ad.budget = 0;
      logger.info(`GoogleAdsAI: killed ad ${ad.id} (CTR=${ad.ctr.toFixed(2)}%)`);
    } else if (ad.ctr > CTR_BOOST_THRESHOLD) {
      ad.budget = Math.min(ad.budget * 4, MAX_BUDGET_PER_AD_USD);
      ad.status = "active";
      logger.info(`GoogleAdsAI: boosted budget for ad ${ad.id} → $${ad.budget}/day`);
    }
  });

  return variants.filter(a => a.status !== "killed");
}

export async function createAdVariant(headline: string, description: string): Promise<AdVariant> {
  const variant: AdVariant = {
    id:          `gads-${Date.now()}`,
    headline,
    description,
    ctr:         Math.random() * 5 + 1,
    budget:      50,
    status:      "active",
    createdAt:   new Date().toISOString(),
  };
  variants.push(variant);
  logger.info(`GoogleAdsAI: created variant ${variant.id}`);
  return variant;
}

export function getVariants(): AdVariant[] {
  return variants;
}
