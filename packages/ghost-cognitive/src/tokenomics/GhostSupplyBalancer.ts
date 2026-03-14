/**
 * GhostSupplyBalancer — adjusts token emission rate in response to supply/demand
 * imbalances.
 *
 * When demand consistently outstrips supply the balancer recommends increasing
 * emissions; when supply exceeds demand it recommends a reduction or burn.
 */
export class GhostSupplyBalancer {
  private readonly demandThreshold: number;
  private readonly surplusThreshold: number;

  constructor(opts: { demandThreshold?: number; surplusThreshold?: number } = {}) {
    this.demandThreshold = opts.demandThreshold ?? 1.1; // demand > 110 % of supply
    this.surplusThreshold = opts.surplusThreshold ?? 0.9; // demand < 90 % of supply
  }

  rebalance(supply: number, demand: number): {
    action: 'increase_emissions' | 'reduce_emissions' | 'balanced';
    ratio: number;
    delta: number;
  } {
    const ratio = supply > 0 ? demand / supply : 1;
    const delta = demand - supply;

    if (ratio >= this.demandThreshold) {
      return { action: 'increase_emissions', ratio, delta };
    }
    if (ratio <= this.surplusThreshold) {
      return { action: 'reduce_emissions', ratio, delta };
    }
    return { action: 'balanced', ratio, delta };
  }

  /** Suggested target emission adjustment as a percentage. */
  adjustmentPct(supply: number, demand: number): number {
    const { ratio } = this.rebalance(supply, demand);
    return Math.round((ratio - 1) * 100 * 10) / 10; // round to 1 dp
  }
}
