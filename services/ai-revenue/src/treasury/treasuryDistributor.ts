import { v4 as uuidv4 } from "uuid";

export interface RevenueSnapshot {
  timestamp: number;
  defiFeesUSD: number;
  validatorRewardsUSD: number;
  tradingPnlUSD: number;
  computeRevenueUSD: number;
  saasRevenueUSD: number;
  totalUSD: number;
}

export interface Distribution {
  id: string;
  timestamp: number;
  totalUSD: number;
  treasuryUSD: number;   // 40%
  validatorsUSD: number; // 30%
  ecosystemUSD: number;  // 30%
  txHash: string;
  status: "pending" | "executed" | "failed";
}

export interface TreasuryBalance {
  totalUSD: number;
  totalGST: number;
  gstPriceUSD: number;
  lastUpdated: number;
  reserves: {
    operationalUSD: number;
    developmentUSD: number;
    ecosystemUSD: number;
    emergencyUSD: number;
  };
}

const GST_PRICE = 2.84; // USD per GST

const treasuryBalance: TreasuryBalance = {
  totalUSD:    4_820_000,
  totalGST:    1_697_183,
  gstPriceUSD: GST_PRICE,
  lastUpdated: Date.now(),
  reserves: {
    operationalUSD:  963_000,
    developmentUSD: 1_445_000,
    ecosystemUSD:   1_204_000,
    emergencyUSD:   1_208_000,
  },
};

const snapshotHistory: RevenueSnapshot[] = Array.from({ length: 48 }, (_, i) => {
  const defi       = +(7_000 + Math.random() * 3_000).toFixed(2);
  const validators = +(3_500 + Math.random() * 1_500).toFixed(2);
  const trading    = +(4_000 + Math.random() * 4_000).toFixed(2);
  const compute    = +(2_000 + Math.random() * 2_000).toFixed(2);
  const saas       = +(8_000 + Math.random() * 2_000).toFixed(2);
  const total      = +(defi + validators + trading + compute + saas).toFixed(2);
  return {
    timestamp:            Date.now() - (48 - i) * 3_600_000,
    defiFeesUSD:          defi,
    validatorRewardsUSD:  validators,
    tradingPnlUSD:        trading,
    computeRevenueUSD:    compute,
    saasRevenueUSD:       saas,
    totalUSD:             total,
  };
});

const distributions: Distribution[] = [
  { id: uuidv4(), timestamp: Date.now() - 86_400_000 * 7,  totalUSD: 184_200, treasuryUSD: 73_680, validatorsUSD: 55_260, ecosystemUSD: 55_260, txHash: "0x" + "a".repeat(64), status: "executed" },
  { id: uuidv4(), timestamp: Date.now() - 86_400_000 * 14, totalUSD: 171_900, treasuryUSD: 68_760, validatorsUSD: 51_570, ecosystemUSD: 51_570, txHash: "0x" + "b".repeat(64), status: "executed" },
  { id: uuidv4(), timestamp: Date.now() - 86_400_000 * 21, totalUSD: 163_400, treasuryUSD: 65_360, validatorsUSD: 49_020, ecosystemUSD: 49_020, txHash: "0x" + "c".repeat(64), status: "executed" },
  { id: uuidv4(), timestamp: Date.now() - 86_400_000 * 28, totalUSD: 158_800, treasuryUSD: 63_520, validatorsUSD: 47_640, ecosystemUSD: 47_640, txHash: "0x" + "d".repeat(64), status: "executed" },
];

// Accumulated revenue between distributions (threshold: $10,000 auto-distributes)
let accumulatedUSD = 0;

export function getTreasuryBalance(): TreasuryBalance {
  return { ...treasuryBalance };
}

export function getDistributions(): Distribution[] {
  return distributions.slice(-50);
}

export function getSnapshotHistory(limit = 48): RevenueSnapshot[] {
  return snapshotHistory.slice(-limit);
}

export function getLatestSnapshot(): RevenueSnapshot | null {
  return snapshotHistory[snapshotHistory.length - 1] ?? null;
}

export function getRevenueStats() {
  const recent24h = snapshotHistory.slice(-24);
  const recent7d  = snapshotHistory.slice(-168);
  return {
    revenue24hUSD:        recent24h.reduce((s, r) => s + r.totalUSD, 0),
    revenue7dUSD:         recent7d.reduce((s, r) => s + r.totalUSD, 0),
    treasuryBalanceUSD:   treasuryBalance.totalUSD,
    accumulatedPendingUSD: accumulatedUSD,
    totalDistributed:     distributions.filter((d) => d.status === "executed").reduce((s, d) => s + d.totalUSD, 0),
    distributionCount:    distributions.length,
    gstPriceUSD:          treasuryBalance.gstPriceUSD,
  };
}

export async function distributeRevenue(amount: number = accumulatedUSD): Promise<Distribution> {
  const distribution: Distribution = {
    id:            uuidv4(),
    timestamp:     Date.now(),
    totalUSD:      amount,
    treasuryUSD:   amount * 0.4,
    validatorsUSD: amount * 0.3,
    ecosystemUSD:  amount * 0.3,
    txHash:        "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""),
    status:        "pending",
  };
  distributions.push(distribution);
  setTimeout(() => {
    distribution.status                      = "executed";
    treasuryBalance.totalUSD               += distribution.treasuryUSD;
    treasuryBalance.totalGST                = +(treasuryBalance.totalUSD / treasuryBalance.gstPriceUSD).toFixed(0);
    treasuryBalance.reserves.developmentUSD += distribution.ecosystemUSD * 0.33;
    treasuryBalance.reserves.ecosystemUSD   += distribution.ecosystemUSD * 0.67;
    treasuryBalance.lastUpdated              = Date.now();
    accumulatedUSD                           = 0;
  }, 5_000);
  return distribution;
}

export function captureSnapshot(defiUSD: number, validatorUSD: number, tradingUSD: number, computeUSD: number, saasUSD: number): RevenueSnapshot {
  const snap: RevenueSnapshot = {
    timestamp:           Date.now(),
    defiFeesUSD:         defiUSD,
    validatorRewardsUSD: validatorUSD,
    tradingPnlUSD:       tradingUSD,
    computeRevenueUSD:   computeUSD,
    saasRevenueUSD:      saasUSD,
    totalUSD:            +(defiUSD + validatorUSD + tradingUSD + computeUSD + saasUSD).toFixed(2),
  };
  snapshotHistory.push(snap);
  if (snapshotHistory.length > 500) snapshotHistory.splice(0, snapshotHistory.length - 500);
  accumulatedUSD += snap.totalUSD;
  return snap;
}

export function tickTreasury(): void {
  // Drift GST price slightly
  treasuryBalance.gstPriceUSD = +(treasuryBalance.gstPriceUSD * (1 + (Math.random() - 0.48) * 0.003)).toFixed(4);
  treasuryBalance.totalGST    = +(treasuryBalance.totalUSD / treasuryBalance.gstPriceUSD).toFixed(0);
  treasuryBalance.lastUpdated = Date.now();
}
