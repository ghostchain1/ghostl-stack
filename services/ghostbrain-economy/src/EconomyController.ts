import { TreasuryManager }   from "./TreasuryManager";
import { LiquidityManager }  from "./LiquidityManager";
import { MarketMonitor }     from "./MarketMonitor";
import { TokenomicsEngine }  from "./TokenomicsEngine";
import { BuybackEngine }     from "./BuybackEngine";

export interface EconomyEvent {
  type:    string;
  payload: Record<string, unknown>;
}

/**
 * EconomyController — main orchestrator for the GhostBrain Economy layer.
 * Reacts to on-chain events and coordinates treasury, liquidity, tokenomics and buyback.
 */
export class EconomyController {
  private treasury:   TreasuryManager;
  private liquidity:  LiquidityManager;
  private market:     MarketMonitor;
  private tokenomics: TokenomicsEngine;
  private buyback:    BuybackEngine;

  constructor(opts?: { dryRun?: boolean }) {
    this.treasury   = new TreasuryManager();
    this.liquidity  = new LiquidityManager();
    this.market     = new MarketMonitor();
    this.tokenomics = new TokenomicsEngine();
    this.buyback    = new BuybackEngine(opts?.dryRun ?? false);
  }

  async process(event: EconomyEvent): Promise<void> {
    console.log(`[EconomyController] Processing event: ${event.type}`);

    switch (event.type) {
      case "liquidity_drop": {
        const { poolId, amount } = event.payload as { poolId: string; amount: number };
        this.liquidity.rebalance(poolId, amount);
        break;
      }

      case "token_price_crash": {
        const { price, supply, demand } = event.payload as {
          price: number; supply: number; demand: number;
        };
        this.market.record(price);
        const signal = this.market.analyze(price);
        console.log(`[EconomyController] Market signal: ${signal}`);

        if (signal === "support_required" || signal === "sell_pressure_extreme") {
          const tReport = this.tokenomics.evaluate(supply, demand);
          console.log(`[EconomyController] Tokenomics: ${tReport.action} (${tReport.reason})`);

          if (signal === "sell_pressure_extreme") {
            const buyAmount = this.treasury.getBalance() * 0.1;
            if (buyAmount > 0) {
              this.buyback.execute(buyAmount, price);
              this.treasury.allocate("buyback", buyAmount, "emergency buyback");
            }
          }
        }
        break;
      }

      case "gas_revenue_spike": {
        const { amount } = event.payload as { amount: number };
        this.treasury.deposit(amount);
        // Evaluate tokenomics after revenue event
        const tr = this.tokenomics.evaluate(
          (event.payload.supply as number) ?? 1_000_000,
          (event.payload.demand as number) ?? 1_000_000
        );
        if (tr.action === "burn_tokens") {
          this.treasury.allocate("token_burn", tr.amount, tr.reason);
        }
        break;
      }

      default:
        console.warn(`[EconomyController] Unknown event type: ${event.type}`);
    }
  }

  status() {
    return {
      treasuryBalance:    this.treasury.getBalance(),
      imbalancedPools:    this.liquidity.imbalancedPools().map(p => p.id),
      totalLiquidityDepth: this.liquidity.totalDepth(),
      latestPrice:        this.market.latest(),
      totalBuyback:       this.buyback.totalBought(),
    };
  }
}
