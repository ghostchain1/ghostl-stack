import { v4 as uuidv4 } from "uuid";

export type ValidatorStatus = "active" | "jailed" | "unbonding" | "inactive";

export interface ValidatorReward {
  id: string;
  address: string;
  chain: "ghostchain";
  stake: number;           // GST staked
  pendingRewards: number;  // GST unclaimed
  totalEarned: number;     // GST lifetime
  blocksProduced: number;
  missedSlots: number;
  performancePct: number;  // 0-100
  commission: number;      // % fee taken (e.g. 5)
  status: ValidatorStatus;
  lastBlock: number;
}

function addr(): string {
  const h = "0123456789abcdef";
  return "0x" + Array.from({ length: 40 }, () => h[Math.floor(Math.random() * 16)]).join("");
}

function v(
  stake: number, pending: number, earned: number,
  blocks: number, missed: number, perf: number,
  commission: number, status: ValidatorStatus
): ValidatorReward {
  return {
    id: uuidv4(), address: addr(), chain: "ghostchain",
    stake, pendingRewards: pending, totalEarned: earned,
    blocksProduced: blocks, missedSlots: missed,
    performancePct: perf, commission, status,
    lastBlock: 4_521_033 - Math.floor(Math.random() * 100),
  };
}

const validators: ValidatorReward[] = [
  v(500_000, 1_240, 98_400,  124_211, 12,  99.0, 5, "active"),
  v(480_000, 1_180,  94_100, 122_800, 18,  98.6, 5, "active"),
  v(510_000, 1_260,  99_800, 123_500,  9,  99.3, 4, "active"),
  v(490_000, 1_210,  96_200, 121_900, 22,  98.2, 5, "active"),
  v(450_000, 1_110,  88_900, 119_700, 41,  96.6, 6, "active"),
  v(470_000, 1_150,  91_400, 120_800, 30,  97.5, 5, "active"),
  v(420_000, 1_040,  82_100, 117_200, 55,  95.5, 7, "active"),
  v(500_000, 1_230,  97_800, 124_050, 14,  98.9, 4, "active"),
  v(460_000, 1_130,  89_900, 120_200, 38,  96.9, 5, "active"),
  v(480_000, 1_180,  93_600, 122_400, 19,  98.5, 5, "active"),
  v(440_000, 1_085,  86_300, 118_500, 47,  96.2, 6, "active"),
  v(510_000, 1_255,  99_100, 123_800, 11,  99.1, 4, "active"),
  v(390_000,   960,  75_800, 113_400, 88,  92.8, 8, "active"),
  v(470_000, 1_155,  91_700, 121_100, 29,  97.6, 5, "active"),
  v(430_000, 1_060,  84_200, 118_000, 51,  95.9, 6, "active"),
  v(500_000, 1_225,  97_200, 123_700, 16,  98.7, 4, "active"),
  v(350_000,   860,  68_400, 108_900, 130, 88.7, 10,"active"),
  v(480_000, 1_180,  93_800, 122_100, 20,  98.4, 5, "active"),
  v(460_000, 1_130,  90_100, 120_400, 35,  97.2, 5, "active"),
  v(440_000, 1_080,  85_900, 119_000, 49,  96.0, 6, "active"),
  v(200_000,   490,  38_900,  78_200, 210, 72.9, 12,"jailed"),
  v(300_000,   240,  59_100,  92_100,  95, 86.4, 8, "unbonding"),
  v(180_000,   440,  34_200,  72_000, 280, 65.8, 15,"inactive"),
  v(250_000,   615,  48_700,  84_500, 160, 79.4, 10,"active"),
];

const distributionLog: { timestamp: number; totalGST: number; recipients: number }[] = [
  { timestamp: Date.now() - 86_400_000 * 7,  totalGST: 28_400, recipients: 22 },
  { timestamp: Date.now() - 86_400_000 * 14, totalGST: 26_800, recipients: 21 },
  { timestamp: Date.now() - 86_400_000 * 21, totalGST: 27_200, recipients: 22 },
];

function jitter(base: number, pct = 0.03): number {
  return base * (1 + (Math.random() - 0.5) * pct * 2);
}

export function getValidators(opts?: { status?: ValidatorStatus }): ValidatorReward[] {
  return validators.filter((v) => !opts?.status || v.status === opts.status);
}

export function getValidator(id: string): ValidatorReward | undefined {
  return validators.find((v) => v.id === id);
}

export function getValidatorStats() {
  const active = validators.filter((v) => v.status === "active");
  return {
    total:              validators.length,
    active:             active.length,
    jailed:             validators.filter((v) => v.status === "jailed").length,
    unbonding:          validators.filter((v) => v.status === "unbonding").length,
    totalStakeGST:      validators.reduce((s, v) => s + v.stake, 0),
    totalPendingGST:    validators.reduce((s, v) => s + v.pendingRewards, 0),
    totalEarnedGST:     validators.reduce((s, v) => s + v.totalEarned, 0),
    avgPerformancePct:  active.reduce((s, v) => s + v.performancePct, 0) / (active.length || 1),
    totalBlocksProduced:validators.reduce((s, v) => s + v.blocksProduced, 0),
  };
}

export async function calculateValidatorRewards(): Promise<{ validators: number; rewardsDistributed: string }> {
  const active = validators.filter((v) => v.status === "active");
  const total = active.reduce((s, v) => s + v.pendingRewards, 0);
  return { validators: active.length, rewardsDistributed: `${total.toFixed(0)} GST` };
}

export function distributeValidatorRewards(): { distributed: boolean; totalGST: number; recipients: number } {
  const active = validators.filter((v) => v.status === "active");
  const totalGST = active.reduce((s, v) => s + v.pendingRewards, 0);
  for (const v of active) {
    v.totalEarned += v.pendingRewards;
    v.pendingRewards = 0;
  }
  distributionLog.push({ timestamp: Date.now(), totalGST, recipients: active.length });
  return { distributed: true, totalGST, recipients: active.length };
}

export function getDistributionLog() { return distributionLog.slice(-50); }

export function tickValidators(): void {
  for (const v of validators) {
    if (v.status !== "active") continue;
    v.pendingRewards += jitter(2.8, 0.2);
    v.blocksProduced += Math.floor(Math.random() * 3);
    if (Math.random() < 0.002) v.missedSlots++;
    v.performancePct = Math.min(100, +(v.blocksProduced / (v.blocksProduced + v.missedSlots) * 100).toFixed(2));
  }
}
