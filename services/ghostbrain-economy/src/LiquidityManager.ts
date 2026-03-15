/**
 * LiquidityManager — balances GhostSwap and cross-layer liquidity pools.
 */
export interface LiquidityPool {
  id:       string;
  layer:    "L1" | "L2" | "L3";
  gstDepth: number;
  ratio:    number;   // target ratio (1.0 = balanced)
}

export class LiquidityManager {
  private pools: Map<string, LiquidityPool> = new Map();

  addPool(pool: LiquidityPool): void {
    this.pools.set(pool.id, pool);
  }

  rebalance(poolId: string, amount: number): void {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error(`Pool '${poolId}' not found`);
    pool.gstDepth += amount;
    console.log(`[Liquidity] Rebalanced ${poolId}: +${amount} GST → depth ${pool.gstDepth}`);
  }

  imbalancedPools(threshold = 0.1): LiquidityPool[] {
    return [...this.pools.values()].filter(p => Math.abs(1 - p.ratio) > threshold);
  }

  totalDepth(): number {
    return [...this.pools.values()].reduce((sum, p) => sum + p.gstDepth, 0);
  }
}
