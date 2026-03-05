import type { MarketData } from '../types.js';

export type MarketSignal = 'stabilization needed' | 'bull market detected' | 'bear market detected' | 'stable';

/**
 * GhostMarketAnalyzer — interprets token price and volatility data to produce
 * signals consumed by the TokenomicsController.
 */
export class GhostMarketAnalyzer {
  private readonly volatilityThreshold: number;
  private readonly bullThreshold: number;
  private readonly bearThreshold: number;

  constructor(opts: {
    volatilityThreshold?: number;
    bullThreshold?: number;
    bearThreshold?: number;
  } = {}) {
    this.volatilityThreshold = opts.volatilityThreshold ?? 30;
    this.bullThreshold = opts.bullThreshold ?? 1.2;  // price >= 120 % of target
    this.bearThreshold = opts.bearThreshold ?? 0.8;  // price <= 80 % of target
  }

  analyze(data: MarketData): MarketSignal {
    if (data.volatility > this.volatilityThreshold) return 'stabilization needed';
    const ratio = data.target > 0 ? data.price / data.target : 1;
    if (ratio >= this.bullThreshold) return 'bull market detected';
    if (ratio <= this.bearThreshold) return 'bear market detected';
    return 'stable';
  }

  /** Return a composite risk score (0 = calm, 100 = extreme). */
  riskScore(data: MarketData): number {
    const volatilityRisk = Math.min(100, (data.volatility / this.volatilityThreshold) * 50);
    const priceRisk = data.target > 0
      ? Math.min(50, Math.abs(data.price - data.target) / data.target * 100)
      : 0;
    return Math.round(volatilityRisk + priceRisk);
  }
}
