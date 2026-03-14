import type { EconomicMetrics, TokenomicsAction } from '../types.js';

/**
 * GhostTokenomicsController — dynamically adjusts GST emission and liquidity
 * strategy in response to real-time price and demand signals.
 */
export class GhostTokenomicsController {
  private readonly overshootRatio: number;
  private readonly undershootRatio: number;

  constructor(opts: { overshootRatio?: number; undershootRatio?: number } = {}) {
    this.overshootRatio = opts.overshootRatio ?? 1.05; // price > 105 % of target → increase liquidity
    this.undershootRatio = opts.undershootRatio ?? 0.95; // price < 95 % of target → reduce emissions
  }

  adjust(metrics: EconomicMetrics): TokenomicsAction {
    if (metrics.tokenTarget <= 0) {
      return { action: 'hold', reason: 'Target price not configured' };
    }

    const ratio = metrics.tokenPrice / metrics.tokenTarget;

    if (ratio < this.undershootRatio) {
      return {
        action: 'reduce_emissions',
        reason: `Token price ${metrics.tokenPrice} below ${this.undershootRatio * 100}% of target ${metrics.tokenTarget}`,
        magnitude: 1 - ratio,
      };
    }

    if (ratio > this.overshootRatio) {
      return {
        action: 'increase_liquidity',
        reason: `Token price ${metrics.tokenPrice} above ${this.overshootRatio * 100}% of target ${metrics.tokenTarget}`,
        magnitude: ratio - 1,
      };
    }

    if (metrics.networkDemand > metrics.transactionVolume * 1.5) {
      return { action: 'increase_emissions', reason: 'Network demand outpacing supply' };
    }

    return { action: 'hold', reason: 'Tokenomics within target range' };
  }
}
