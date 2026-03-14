/**
 * staking-engine.ts — Native token staking design module.
 *
 * Generates a single-asset staking contract (stake GHX, earn rewards)
 * and simulates the reward-per-token accumulator over time.
 */

import {
  generateContract,
  type GeneratedFile,
  type StakingOptions,
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

export interface StakingConfig {
  projectName: string;
  /** Annual reward budget in reward token units (18 dec bigint) */
  annualRewardBudget: bigint;
  /** Expected total staked tokens at steady state (18 dec bigint, for APR calculation) */
  expectedTotalStaked: bigint;
  /** Reward token price / staked token price ratio (for APR denominator). Default 1.0 */
  tokenPriceRatio?: number;
  emitDeploy?: boolean;
  emitSdk?: boolean;
}

export interface StakingDesignOutput {
  files: GeneratedFile[];
  simulation: StakingSimulation;
}

export interface StakingSimulation {
  rewardRatePerSecond: string;
  estimatedApr:        string;
  estimatedApy:        string;
  /** Reward a user with 1% of total staked earns after 30 days (in reward token wei) */
  sampleReward30d:     string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function designStaking(config: StakingConfig): StakingDesignOutput {
  const YEAR_SECONDS = 31_536_000n;
  const ratePerSec   = config.annualRewardBudget / YEAR_SECONDS;

  const result = generateContract({
    type: "staking",
    name: config.projectName,
    options: {
      name:             `${config.projectName}Staking`,
      label:            config.projectName,
      defaultRewardRate: ratePerSec.toString(),
    } satisfies Partial<StakingOptions>,
    emitDeployScript: config.emitDeploy ?? true,
    emitSdkWrapper:   config.emitSdk   ?? false,
  });

  const files: GeneratedFile[] = Array.isArray(result.solidity)
    ? result.solidity
    : [result.solidity];
  if (result.deployScript) files.push(result.deployScript);
  if (result.sdkWrapper)   files.push(result.sdkWrapper);

  // ── 30-day simulation for a 1%-stake user ────────────────────────────────
  const totalStaked = Number(config.expectedTotalStaked) / 1e18;
  const rateNum     = Number(ratePerSec) / 1e18;

  const aprPct = aprFromRate(rateNum, totalStaked, config.tokenPriceRatio ?? 1.0);
  const apyPct = apyFromApr(aprPct, 365);

  const startTs = 1_700_000_000;
  const endTs   = startTs + 30 * 24 * 3600;

  const globalState: AccumulatorState = {
    rewardPerTokenStored: 0,
    lastUpdateTime: startTs,
    rewardRate: rateNum,
    totalStaked: Number(config.expectedTotalStaked) / 1e18,
  };
  const userState: UserAccumulatorState = {
    stakedBalance:          Number(config.expectedTotalStaked / 100n) / 1e18, // 1%
    userRewardPerTokenPaid: 0,
    rewards:                0,
  };

  const updated = updateAccumulator(globalState, endTs);
  const earned  = pendingRewards(updated, userState, endTs);

  const simulation: StakingSimulation = {
    rewardRatePerSecond: ratePerSec.toString(),
    estimatedApr:        `${aprPct.toFixed(2)}%`,
    estimatedApy:        `${apyPct.toFixed(2)}%`,
    sampleReward30d:     (earned * 1e18).toFixed(0),
  };

  return { files, simulation };
}
