/**
 * Validator Manager
 *
 * Evaluates each validator's performance and generates penalise or reward
 * proposals for governance ratification.
 *
 * Policy (from economic-policy.ts):
 *   - uptime < VALIDATOR_MIN_UPTIME → penalise signal
 *   - performance ≥ 99             → top-tier reward bonus signal
 *   - performance ≥ 97             → high-tier reward bonus signal
 *   - jailed validators → flag for governance review
 */
import { randomUUID } from "node:crypto";
import type { NetworkState, GovernorProposal } from "../types.js";
import { ECONOMIC_POLICY } from "../policies/economic-policy.js";

export async function manageValidators(network: NetworkState): Promise<GovernorProposal[]> {
  const proposals: GovernorProposal[] = [];
  const now = Date.now();

  for (const v of network.validators) {
    // Penalise — low uptime
    if (v.uptime < ECONOMIC_POLICY.VALIDATOR_MIN_UPTIME) {
      proposals.push({
        id:          randomUUID(),
        type:        "validator_penalize",
        description: `Validator ${v.moniker} (${v.address}) uptime ${v.uptime.toFixed(1)}% below policy minimum ${ECONOMIC_POLICY.VALIDATOR_MIN_UPTIME}%. Missed ${v.missedBlocks} blocks. Propose governance review and slashing signal.`,
        params: {
          validator:    v.address,
          moniker:      v.moniker,
          uptime:       v.uptime,
          missedBlocks: v.missedBlocks,
          signedBlocks: v.signedBlocks,
          jailed:       v.jailed,
        },
        timestamp:            now,
        risk:                 v.uptime < 80 ? "high" : "medium",
        requiresRatification: true,
        autoExecute:          false,
      });
    }

    // Flag jailed validators separately
    if (v.jailed) {
      proposals.push({
        id:          randomUUID(),
        type:        "validator_penalize",
        description: `Validator ${v.moniker} (${v.address}) is jailed. Requires governance review for unjailing eligibility or tombstoning.`,
        params: {
          validator: v.address,
          moniker:   v.moniker,
          jailed:    true,
        },
        timestamp:            now,
        risk:                 "high",
        requiresRatification: true,
        autoExecute:          false,
      });
    }

    // Reward — high performance tier
    const rewardTier = ECONOMIC_POLICY.VALIDATOR_REWARD_TIERS.find(
      t => v.performance >= t.minScore && t.bonusBps > 0
    );

    if (rewardTier) {
      proposals.push({
        id:          randomUUID(),
        type:        "validator_reward",
        description: `Validator ${v.moniker} (${v.address}) achieved performance score ${v.performance.toFixed(1)} (≥${rewardTier.minScore}). Propose +${rewardTier.bonusBps / 100}% reward bonus for this epoch.`,
        params: {
          validator:      v.address,
          moniker:        v.moniker,
          performance:    v.performance,
          uptime:         v.uptime,
          bonusBps:       rewardTier.bonusBps,
          delegatedStake: v.delegatedStake.toString(),
        },
        timestamp:            now,
        risk:                 "low",
        requiresRatification: true,
        autoExecute:          false,
      });
    }
  }

  return proposals;
}
