import type { GasPolicy } from '../config.js';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { recordPolicyDrift, recordPolicyHistory } from './store.js';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const maybeEvolvePolicy = async (input: {
  chainKey: string;
  policy: GasPolicy;
  successRate: number;
  outOfGasRate: number;
  overridesLocked: boolean;
}) => {
  if (input.overridesLocked || config.AUTONOMY_POLICY_LOCK) return null;

  const maxDelta = config.AUTONOMY_POLICY_MAX_DELTA;
  let delta = 0;
  let reason = '';

  if (input.outOfGasRate > 0.2 || input.successRate < 0.6) {
    delta = maxDelta;
    reason = 'increasing_margin_due_to_failures';
  } else if (input.successRate > 0.9 && input.outOfGasRate < 0.05) {
    delta = -maxDelta;
    reason = 'reducing_margin_due_to_stability';
  }

  if (delta === 0) return null;

  const baseMultiplier = clamp(input.policy.baseMultiplier + delta, 1.1, 2.5);
  const safetyMarginPercent = clamp(input.policy.safetyMarginPercent + delta * 10, 5, 35);
  const retryStep = clamp(input.policy.retry.multiplierStep + delta * 0.2, 1.05, 1.6);

  const updated: GasPolicy = {
    ...input.policy,
    version: `${input.policy.version}-auto-${new Date().toISOString().slice(0, 10)}`,
    baseMultiplier,
    safetyMarginPercent,
    retry: {
      ...input.policy.retry,
      multiplierStep: retryStep
    }
  };

  await query('UPDATE gas_policies SET active = false WHERE chain_key = $1', [input.chainKey]);
  await query(
    `INSERT INTO gas_policies (chain_key, version, policy, active)
     VALUES ($1,$2,$3,true)`,
    [input.chainKey, updated.version, updated]
  );

  await recordPolicyHistory(input.chainKey, updated.version, updated, 'agent', 'active', {
    successRate: input.successRate,
    outOfGasRate: input.outOfGasRate
  });

  await recordPolicyDrift(input.chainKey, updated.baseMultiplier, updated.safetyMarginPercent, updated.retry.multiplierStep, reason);

  return updated;
};
