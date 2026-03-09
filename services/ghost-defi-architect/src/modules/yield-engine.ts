/**
 * yield-engine.ts — LP yield farming design module.
 *
 * Generates a YieldFarm contract for LP token holders and simulates
 * reward accumulation using the reward-per-token accumulator model.
 */

import {
  generateContract,
  type GeneratedFile,
  type YieldFarmOptions,
} from "@ghostchain/ghost-contract-factory";
import {
  updateAccumulator,
  pendingRewards,
  aprFromRate,
  apyFromApr,
  type AccumulatorState,
  type UserAccumulatorState,
} from "../math/reward-curves.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YieldConfig {
  projectName: string;
  /** Annual reward budget in reward token units (18 dec bigint) */
  annualRewardBudget: bigint;
  /** Expected total LP tokens staked at steady state (18 dec bigint) */
  expectedTotalLpStaked: bigint;
  /**
   * Reward token price / LP token price ratio.
   * If reward is GST and LP token is worth ~$2 in GST terms: ratio = 0.5
   * Default: 1.0 (same price)
   */
  tokenPriceRatio?: number;
  emitDeploy?: boolean;
  emitSdk?: boolean;
}

export interface YieldDesignOutput {
  files: GeneratedFile[];
  simulation: YieldSimulation;
}

export interface YieldSimulation {
  rewardRatePerSecond: string;
  estimatedApr:        string;
  estimatedApy:        string;
  /** Reward a user who holds 5% of all LP tokens earns after 7 days (wei) */
  sampleReward7d:      string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function designYield(config: YieldConfig): YieldDesignOutput {
  const YEAR_SECONDS = 31_536_000n;
  const ratePerSec   = config.annualRewardBudget / YEAR_SECONDS;

  const result = generateContract({
    type: "yield-farm",
    name: config.projectName,
    options: {
      name:             `${config.projectName}YieldFarm`,
      label:            config.projectName,
      defaultRewardRate: ratePerSec.toString(),
    } satisfies Partial<YieldFarmOptions>,
    emitDeployScript: config.emitDeploy ?? true,
    emitSdkWrapper:   config.emitSdk   ?? false,
  });

  const files: GeneratedFile[] = Array.isArray(result.solidity)
    ? result.solidity
    : [result.solidity];
  if (result.deployScript) files.push(result.deployScript);
  if (result.sdkWrapper)   files.push(result.sdkWrapper);

  // ── 7-day simulation for a 5%-LP-share user ──────────────────────────────
  const totalLp = Number(config.expectedTotalLpStaked) / 1e18;
  const rateNum = Number(ratePerSec) / 1e18;

  const aprPct = aprFromRate(rateNum, totalLp, config.tokenPriceRatio ?? 1.0);
  const apyPct = apyFromApr(aprPct, 52); // weekly compounding

  const startTs = 1_700_000_000;
  const endTs   = startTs + 7 * 24 * 3600;
  const globalState: AccumulatorState = {
    rewardPerTokenStored: 0,
    lastUpdateTime: startTs,
    rewardRate: rateNum,
    totalStaked: totalLp,
  };
  const userState: UserAccumulatorState = {
    stakedBalance:          Number(config.expectedTotalLpStaked / 20n) / 1e18, // 5%
    userRewardPerTokenPaid: 0,
    rewards:                0,
  };

  const updated = updateAccumulator(globalState, endTs);
  const earned  = pendingRewards(updated, userState, endTs);

  const simulation: YieldSimulation = {
    rewardRatePerSecond: ratePerSec.toString(),
    estimatedApr:        `${aprPct.toFixed(2)}%`,
    estimatedApy:        `${apyPct.toFixed(2)}%`,
    sampleReward7d:      (earned * 1e18).toFixed(0),
  };

  return { files, simulation };
}
