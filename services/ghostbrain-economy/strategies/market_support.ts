/**
 * Market Support Strategy
 *
 * Executes buybacks and injects liquidity when price drops below support threshold.
 */
import { BuybackEngine }   from "../src/BuybackEngine";
import { LiquidityManager } from "../src/LiquidityManager";
import { TreasuryManager }  from "../src/TreasuryManager";

export async function marketSupportStrategy(
  currentPrice: number,
  targetPrice:  number,
  treasury:     TreasuryManager,
  liquidity:    LiquidityManager,
  buyback:      BuybackEngine,
  primaryPoolId = "ghost-l1-l2-pool"
): Promise<void> {
  const deviation = (targetPrice - currentPrice) / targetPrice;

  if (deviation <= 0) {
    console.log("[Strategy:MarketSupport] Price at or above target — no action needed");
    return;
  }

  const supportBudget = treasury.getBalance() * Math.min(deviation * 0.5, 0.20); // max 20 % of reserves

  if (supportBudget <= 0) {
    console.warn("[Strategy:MarketSupport] Zero support budget — aborting");
    return;
  }

  // Split 60 / 40 between buyback and liquidity injection
  const buybackAmount   = supportBudget * 0.6;
  const liquidityAmount = supportBudget * 0.4;

  buyback.execute(buybackAmount, currentPrice);
  treasury.allocate("market_buyback",      buybackAmount,   "market support");
  treasury.allocate("liquidity_injection", liquidityAmount, "market support");
  liquidity.rebalance(primaryPoolId, liquidityAmount);

  console.log(
    `[Strategy:MarketSupport] Price ${currentPrice} (target ${targetPrice}): ` +
    `buyback ${buybackAmount.toFixed(2)} GST, inject ${liquidityAmount.toFixed(2)} GST into ${primaryPoolId}`
  );
}
