/**
 * TreasuryManager — controls GhostChain treasury capital allocation.
 */
export interface TreasuryAllocation {
  target:     string;
  amount:     number;     // GST
  reason:     string;
  approvedAt: number;
}

export class TreasuryManager {
  private balance:      number = 0;
  private allocations:  TreasuryAllocation[] = [];

  setBalance(gst: number): void {
    this.balance = gst;
  }

  getBalance(): number { return this.balance; }

  /** Increment the treasury balance (e.g. on gas revenue receipt). */
  deposit(amount: number): void {
    this.balance += amount;
    console.log(`[Treasury] Deposited ${amount} GST. Balance: ${this.balance}`);
  }

  allocate(target: string, amount: number, reason: string): TreasuryAllocation {
    if (amount > this.balance) {
      throw new Error(`TreasuryManager: insufficient balance (have ${this.balance} GST, need ${amount})`);
    }
    this.balance -= amount;
    const alloc: TreasuryAllocation = { target, amount, reason, approvedAt: Date.now() };
    this.allocations.push(alloc);
    console.log(`[Treasury] Allocated ${amount} GST → ${target} (${reason})`);
    return alloc;
  }

  history(): TreasuryAllocation[] {
    return this.allocations;
  }
}
