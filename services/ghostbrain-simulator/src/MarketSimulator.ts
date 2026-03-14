/**
 * MarketSimulator — models token price, liquidity, and gas market dynamics.
 */
export interface PriceSimResult {
  currentPrice:        number;
  predictedPriceChange: number;  // %
  volatilityScore:     number;   // 0-100
  recommendation:      string;
}

export interface LiquiditySimResult {
  slippageBps:    number;
  impermanentLoss: number;
  recommendation: string;
}

export class MarketSimulator {
  simulatePrice(currentPrice: number, volatility: number): PriceSimResult {
    const change = volatility * (Math.random() > 0.5 ? 0.8 : -0.8);
    return {
      currentPrice,
      predictedPriceChange: change,
      volatilityScore:      Math.min(volatility * 10, 100),
      recommendation:       Math.abs(change) > 10 ? "activate_price_support" : "hold",
    };
  }

  simulateLiquidity(poolSizeGST: number, tradeSize: number): LiquiditySimResult {
    const slippageBps    = (tradeSize / poolSizeGST) * 10_000;
    const impermanentLoss = (slippageBps / 10_000) * 0.5;

    return {
      slippageBps,
      impermanentLoss,
      recommendation: slippageBps > 50 ? "add_liquidity" : "pool_healthy",
    };
  }

  simulateGasMarket(pendingTxCount: number): { estimatedGasPrice: number; congested: boolean } {
    const baseGas = 1_000_000_000;   // 1 GhostGas
    const surge   = pendingTxCount > 1000 ? pendingTxCount / 1000 : 1;
    return {
      estimatedGasPrice: Math.floor(baseGas * surge),
      congested:         pendingTxCount > 1000,
    };
  }
}
