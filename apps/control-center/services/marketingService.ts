// Marketing engine data service — proxies to AIMS (9970) + VGE (9971)

export interface MarketingStats {
  aims: {
    activeCampaigns:  number;
    totalReach:       number;
    engagementRate:   number;
    leadsGenerated:   number;
    postsPublished:   number;
    topChannel:       string;
  } | null;
  vge: {
    activeCompaigns:  number;
    totalImpressions: number;
    viralCoefficient: number;
    referrals:        number;
  } | null;
  timestamp: number;
}

export async function getMarketingStats(): Promise<MarketingStats> {
  const res = await fetch("/api/marketing/stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`marketing/stats ${res.status}`);
  return res.json();
}
