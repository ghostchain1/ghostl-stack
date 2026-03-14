import { TreasuryManager } from "../src/TreasuryManager";

const treasury = new TreasuryManager();

export const TreasuryAgent = {
  name: "TreasuryAgent",
  description: "Monitors and manages the Ghost treasury reserves",

  async react(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    switch (event.type) {
      case "gas_revenue": {
        const amount = (event.payload.amount as number) ?? 0;
        treasury.deposit(amount);
        console.log(`[TreasuryAgent] Deposited ${amount} GST. Balance: ${treasury.getBalance()}`);
        break;
      }
      case "emergency_spend": {
        const { target, amount, reason } = event.payload as { target: string; amount: number; reason: string };
        treasury.allocate(target, amount, reason);
        console.log(`[TreasuryAgent] Allocated ${amount} GST for ${target}`);
        break;
      }
      default:
        break;
    }
  },
};
