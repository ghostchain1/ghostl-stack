/**
 * TokenBurnEngine — tracks and simulates GST token burn events.
 * In production, replace `simulateBurn` with an actual on-chain tx via ethers.js.
 */

import logger from "../utils/logger";

export interface BurnEvent {
  id:        string;
  amount:    number; // GST
  trigger:   "fee-sweep" | "buyback" | "governance" | "manual";
  txHash:    string;
  burnedAt:  string;
}

let totalBurned  = 0;
const burnHistory: BurnEvent[] = [];

export async function burnGST(amount: number, trigger: BurnEvent["trigger"] = "fee-sweep"): Promise<BurnEvent> {
  const event: BurnEvent = {
    id:       `burn-${Date.now()}`,
    amount,
    trigger,
    txHash:   `0x${Buffer.from(Math.random().toString()).toString("hex").slice(0, 64)}`,
    burnedAt: new Date().toISOString(),
  };

  totalBurned += amount;
  burnHistory.unshift(event);
  if (burnHistory.length > 200) burnHistory.pop();

  logger.info(`TokenBurnEngine: burned ${amount.toLocaleString()} GST via ${trigger} — total burned: ${totalBurned.toLocaleString()}`);
  return event;
}

export async function runWeeklyFeeSweep(feePool: number): Promise<BurnEvent> {
  const burnAmount = Math.round(feePool * 0.4); // burn 40 % of collected fees
  return burnGST(burnAmount, "fee-sweep");
}

export function getBurnStats() {
  return {
    totalBurned,
    eventCount: burnHistory.length,
    recent:     burnHistory.slice(0, 10),
  };
}
