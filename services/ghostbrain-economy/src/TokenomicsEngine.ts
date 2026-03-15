/**
 * TokenomicsEngine — evaluates token supply/demand balance and recommends actions.
 */
export type TokenomicsAction = "mint_rewards" | "burn_tokens" | "hold";

export interface TokenomicsReport {
  action:     TokenomicsAction;
  amount:     number;
  supplyRatio: number;
  reason:     string;
}

export class TokenomicsEngine {
  /** Target demand-to-supply ratio considered balanced. */
  private readonly targetRatio: number;

  constructor(targetRatio = 1.0) {
    this.targetRatio = targetRatio;
  }

  evaluate(supply: number, demand: number): TokenomicsReport {
    const ratio = demand / Math.max(supply, 1);

    if (ratio < 0.8) {
      const amount = (supply - demand) * 0.05;   // burn 5 % of excess
      return { action: "burn_tokens",  amount, supplyRatio: ratio, reason: "excess supply detected" };
    }

    if (ratio > 1.2) {
      const amount = (demand - supply) * 0.1;    // mint 10 % of deficit
      return { action: "mint_rewards", amount, supplyRatio: ratio, reason: "supply deficit detected" };
    }

    return { action: "hold", amount: 0, supplyRatio: ratio, reason: "supply and demand balanced" };
  }
}
