/**
 * TwitterAdsAI — AI-managed Twitter/X promoted tweet campaigns.
 */

import logger from "../utils/logger";

export interface TwitterAd {
  id:        string;
  tweet:     string;
  targeting: string[];
  cpm:       number;  // cost per 1000 impressions USD
  reach:     number;
  clicks:    number;
  ctr:       number;
  status:    "active" | "paused" | "killed";
  createdAt: string;
}

const ads: TwitterAd[] = [
  {
    id: "twad-001",
    tweet: "🚀 GhostChain delivers what other L1s promise. Sub-second finality. Near-zero fees. Build on Ghost. #GhostChain",
    targeting: ["crypto", "web3", "blockchain", "developers"],
    cpm: 8.5, reach: 12000, clicks: 480, ctr: 4.0, status: "active",
    createdAt: new Date().toISOString(),
  },
  {
    id: "twad-002",
    tweet: "/GST/ is the gas token of the Ghost ecosystem. Deflationary. Governance-enabled. Yield-bearing. 📈 #GST #DeFi",
    targeting: ["defi", "token", "yield", "crypto"],
    cpm: 6.2, reach: 8000, clicks: 120, ctr: 1.5, status: "paused",
    createdAt: new Date().toISOString(),
  },
];

const CTR_KILL  = 2.0;
const CTR_BOOST = 6.0;

export async function optimiseTwitterAds(): Promise<TwitterAd[]> {
  logger.info("TwitterAdsAI: running optimisation cycle");

  ads.forEach(ad => {
    ad.reach  += Math.floor(Math.random() * 1000);
    ad.clicks += Math.floor(Math.random() * 50);
    ad.ctr     = (ad.clicks / ad.reach) * 100;

    if (ad.ctr < CTR_KILL) {
      ad.status = "killed";
      logger.info(`TwitterAdsAI: killed ad ${ad.id}`);
    } else if (ad.ctr > CTR_BOOST) {
      ad.cpm   *= 1.5; // increase spend to capture reach
      ad.status = "active";
    }
  });

  return ads.filter(a => a.status !== "killed");
}

export function getAds(): TwitterAd[] {
  return ads;
}
