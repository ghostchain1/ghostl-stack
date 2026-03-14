// Revenue data service — proxies to ARE (port 9987)

export interface RevenueStats {
  defi: {
    totalPools:       number;
    activePools:      number;
    totalTvlUSD:      number;
    totalVolume24hUSD:number;
    totalFees24hUSD:  number;
    avgApr:           number;
  };
  validators: {
    total:            number;
    active:           number;
    totalStakeGST:    number;
    totalPendingGST:  number;
    avgPerformancePct:number;
  };
  trading: {
    totalStrategies:  number;
    runningStrategies:number;
    totalPnlUSD:      number;
    totalCapitalUSD:  number;
    avgWinRate:       number;
  };
  marketplace: {
    activeJobs:       number;
    queuedJobs:       number;
    completedJobs:    number;
    totalRevenueGST:  number;
  };
  saas: {
    activeClients:    number;
    totalMRR_USD:     number;
    totalARR_USD:     number;
    avgUptimePct:     number;
  };
  treasury: {
    totalUSD:         number;
    totalGST:         number;
    gstPriceUSD:      number;
  };
  timestamp: number;
}

export async function getRevenue(): Promise<RevenueStats> {
  const res = await fetch("/api/revenue/stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`revenue/stats ${res.status}`);
  return res.json();
}

export async function triggerDistribute(): Promise<{ success: boolean }> {
  const res = await fetch("/api/revenue/distribute", { method: "POST" });
  return res.json();
}
