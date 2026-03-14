/**
 * Liquidity Rebalance Strategy
 *
 * Triggered when a pool's depth falls below the target threshold.
 * Pulls reserves from the treasury and injects them into the imbalanced pool.
 */
import { LiquidityManager } from "../src/LiquidityManager";
import { TreasuryManager }  from "../src/TreasuryManager";

export async function liquidityRebalanceStrategy(
  poolId: string,
  deficitGST: number,
  liquidity: LiquidityManager,
  treasury: TreasuryManager
): Promise<void> {
  if (treasury.getBalance() < deficitGST) {
    console.warn(`[Strategy:LiquidityRebalance] Insufficient treasury funds (need ${deficitGST})`);
    return;
  }
  treasury.allocate("liquidity_injection", deficitGST, "pool rebalance");
  liquidity.rebalance(poolId, deficitGST);
  console.log(`[Strategy:LiquidityRebalance] Injected ${deficitGST} GST into pool ${poolId}`);
}
