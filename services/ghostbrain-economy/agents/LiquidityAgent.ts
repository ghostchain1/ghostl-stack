import { LiquidityManager } from "../src/LiquidityManager";

const liquidity = new LiquidityManager();

export const LiquidityAgent = {
  name: "LiquidityAgent",
  description: "Monitors cross-layer liquidity pools and triggers rebalancing",

  async react(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    switch (event.type) {
      case "pool_imbalance": {
        const { poolId, amount } = event.payload as { poolId: string; amount: number };
        liquidity.rebalance(poolId, amount);
        console.log(`[LiquidityAgent] Rebalanced pool ${poolId} by ${amount} GST`);
        break;
      }
      case "pool_register": {
        const pool = event.payload as unknown as Parameters<LiquidityManager["addPool"]>[0];
        liquidity.addPool(pool);
        console.log(`[LiquidityAgent] Registered pool ${pool.id} (${pool.layer})`);
        break;
      }
      default:
        break;
    }
  },
};
