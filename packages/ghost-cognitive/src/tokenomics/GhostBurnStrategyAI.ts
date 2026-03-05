/**
 * GhostBurnStrategyAI — computes the optimal token burn amount for a given
 * transaction volume and inflation pressure.
 *
 * Base rate: 2 % of volume is burned. During inflationary pressure the rate
 * scales up toward `maxRate` to defend purchasing power.
 */
export class GhostBurnStrategyAI {
  private readonly baseRate: number;
  private readonly maxRate: number;
  private readonly inflationThreshold: number;

  constructor(opts: {
    baseRate?: number;
    maxRate?: number;
    inflationThreshold?: number;
  } = {}) {
    this.baseRate = opts.baseRate ?? 0.02;
    this.maxRate = opts.maxRate ?? 0.05;
    this.inflationThreshold = opts.inflationThreshold ?? 0.05; // 5 % annual inflation
  }

  /**
   * Compute the token amount to burn.
   *
   * @param volume - Total transaction volume in the measurement period.
   * @param inflationRate - Current annual inflation rate (decimal; 0.05 = 5 %).
   */
  compute(volume: number, inflationRate = 0): number {
    const pressureMultiplier = inflationRate > this.inflationThreshold
      ? Math.min(this.maxRate / this.baseRate, 1 + (inflationRate - this.inflationThreshold) * 10)
      : 1;

    const effectiveRate = Math.min(this.maxRate, this.baseRate * pressureMultiplier);
    return volume * effectiveRate;
  }

  /** Return the effective burn rate given current inflation. */
  effectiveRate(inflationRate = 0): number {
    const pressureMultiplier = inflationRate > this.inflationThreshold
      ? Math.min(this.maxRate / this.baseRate, 1 + (inflationRate - this.inflationThreshold) * 10)
      : 1;
    return Math.min(this.maxRate, this.baseRate * pressureMultiplier);
  }
}
