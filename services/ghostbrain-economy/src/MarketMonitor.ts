/**
 * MarketMonitor — tracks GST token price and signals when intervention is needed.
 */
export interface PriceSnapshot {
  price:     number;
  timestamp: number;
  source:    string;
}

export type MarketSignal = "stable" | "support_required" | "sell_pressure_extreme";

export class MarketMonitor {
  private history: PriceSnapshot[] = [];
  private readonly supportThreshold: number;

  constructor(supportThreshold = 0.8) {
    this.supportThreshold = supportThreshold;
  }

  record(price: number, source = "oracle"): void {
    this.history.push({ price, timestamp: Date.now(), source });
    if (this.history.length > 10_000) this.history.shift();
  }

  analyze(price: number): MarketSignal {
    if (price < this.supportThreshold * 0.6) return "sell_pressure_extreme";
    if (price < this.supportThreshold)       return "support_required";
    return "stable";
  }

  movingAverage(window = 10): number {
    const recent = this.history.slice(-window);
    if (recent.length === 0) return 0;
    return recent.reduce((s, p) => s + p.price, 0) / recent.length;
  }

  latest(): PriceSnapshot | undefined {
    return this.history[this.history.length - 1];
  }
}
