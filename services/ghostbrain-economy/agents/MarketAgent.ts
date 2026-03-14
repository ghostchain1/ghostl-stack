import { MarketMonitor } from "../src/MarketMonitor";
import { BuybackEngine } from "../src/BuybackEngine";

const monitor = new MarketMonitor();
const buyback = new BuybackEngine();

export const MarketAgent = {
  name: "MarketAgent",
  description: "Watches GST market price and executes buybacks when needed",

  async react(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    switch (event.type) {
      case "price_update": {
        const { price, source } = event.payload as { price: number; source?: string };
        monitor.record(price, source ?? "oracle");
        const signal = monitor.analyze(price);
        console.log(`[MarketAgent] Price ${price} → signal: ${signal}`);
        if (signal === "sell_pressure_extreme") {
          buyback.execute(price * 1_000, price);
          console.log(`[MarketAgent] Emergency buyback executed`);
        }
        break;
      }
      default:
        break;
    }
  },
};
