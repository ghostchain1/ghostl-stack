/**
 * EconomicSimulation — runs Monte-Carlo-style projections of GhostChain's
 * token price, market cap, and ecosystem TVL over a configurable horizon.
 */

import logger from "../utils/logger";

export interface SimParams {
  horizonDays:       number;  // 30 | 90 | 365
  initialPriceUSD:   number;  // current GST price
  initialMarketCapUSD: number;
  initialTVLUSD:     number;
  dailyGrowthRate:   number;  // e.g. 0.002 = 0.2 % / day
  volatility:        number;  // std dev of daily return e.g. 0.04
  burnRateDaily:     number;  // GST burned per day
  emissionsDaily:    number;  // GST emitted per day
}

export interface SimSnapshot {
  day:          number;
  priceUSD:     number;
  marketCapUSD: number;
  tvlUSD:       number;
  netSupplyChange: number; // emissions - burns
}

export interface SimResult {
  params:    SimParams;
  snapshots: SimSnapshot[];
  summary: {
    finalPriceUSD:     number;
    finalMarketCapUSD: number;
    finalTVLUSD:       number;
    peakPriceUSD:      number;
    minPriceUSD:       number;
    totalBurned:       number;
    totalEmitted:      number;
  };
  simulatedAt: string;
}

function gaussianRandom(mean: number, std: number): number {
  // Box–Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function simulateEconomy(params: SimParams): SimResult {
  const snapshots: SimSnapshot[] = [];
  let price     = params.initialPriceUSD;
  let marketCap = params.initialMarketCapUSD;
  let tvl       = params.initialTVLUSD;
  let totalBurned   = 0;
  let totalEmitted  = 0;
  let peak = price;
  let min  = price;

  for (let day = 1; day <= params.horizonDays; day++) {
    const dailyReturn = gaussianRandom(params.dailyGrowthRate, params.volatility);
    price     = Math.max(0.001, price * (1 + dailyReturn));
    marketCap = Math.max(0, marketCap * (1 + dailyReturn * 0.9));
    tvl       = Math.max(0, tvl * (1 + dailyReturn * 0.7 + 0.001));

    const netSupplyChange = params.emissionsDaily - params.burnRateDaily;
    totalBurned  += params.burnRateDaily;
    totalEmitted += params.emissionsDaily;

    peak = Math.max(peak, price);
    min  = Math.min(min, price);

    if (day % 7 === 0 || day === params.horizonDays) {
      snapshots.push({ day, priceUSD: +price.toFixed(4), marketCapUSD: +marketCap.toFixed(0), tvlUSD: +tvl.toFixed(0), netSupplyChange });
    }
  }

  const result: SimResult = {
    params,
    snapshots,
    summary: {
      finalPriceUSD:     +price.toFixed(4),
      finalMarketCapUSD: +marketCap.toFixed(0),
      finalTVLUSD:       +tvl.toFixed(0),
      peakPriceUSD:      +peak.toFixed(4),
      minPriceUSD:       +min.toFixed(4),
      totalBurned:       +totalBurned.toFixed(0),
      totalEmitted:      +totalEmitted.toFixed(0),
    },
    simulatedAt: new Date().toISOString(),
  };

  logger.info(`EconomicSimulation: ${params.horizonDays}d sim complete — final price $${result.summary.finalPriceUSD}`);
  return result;
}

export function defaultParams(): SimParams {
  return {
    horizonDays:         90,
    initialPriceUSD:     0.08,
    initialMarketCapUSD: 40_000_000,
    initialTVLUSD:       3_000_000,
    dailyGrowthRate:     0.002,
    volatility:          0.04,
    burnRateDaily:       50_000,
    emissionsDaily:      100_000,
  };
}
