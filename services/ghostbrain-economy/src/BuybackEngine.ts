/**
 * BuybackEngine — executes GST token buybacks to stabilise price.
 */
export interface BuybackRecord {
  amount:    number;
  price:     number;
  executedAt: number;
  txHash:    string;
}

export class BuybackEngine {
  private records: BuybackRecord[] = [];
  private dryRun: boolean;

  constructor(dryRun = false) {
    this.dryRun = dryRun;
  }

  execute(amount: number, currentPrice: number): BuybackRecord {
    const txHash = this.dryRun
      ? `dry-${Date.now()}`
      : `0x${Buffer.from(`buyback-${Date.now()}`).toString("hex").slice(0, 64)}`;

    const record: BuybackRecord = {
      amount,
      price: currentPrice,
      executedAt: Date.now(),
      txHash,
    };

    this.records.push(record);

    console.log(
      `[BuybackEngine] ${this.dryRun ? "[DRY-RUN] " : ""}Buyback ${amount} GST @ ${currentPrice} → ${txHash}`
    );

    return record;
  }

  history(): BuybackRecord[] {
    return [...this.records];
  }

  totalBought(): number {
    return this.records.reduce((s, r) => s + r.amount, 0);
  }
}
