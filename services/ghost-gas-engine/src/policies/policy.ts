import { GasPolicy } from '../config.js';
import { query } from '../db/index.js';

export const getActivePolicy = async (chainKey: string, fallback: GasPolicy): Promise<GasPolicy> => {
  const rows = await query<{ policy: GasPolicy }>(
    'SELECT policy FROM gas_policies WHERE chain_key = $1 AND active = true ORDER BY created_at DESC LIMIT 1',
    [chainKey]
  );
  if (rows[0]?.policy) return rows[0].policy;
  return fallback;
};

export const recommendedGasLimit = (estimate: bigint, policy: GasPolicy): bigint => {
  const base = estimate * BigInt(Math.round(policy.baseMultiplier * 100)) / BigInt(100);
  const margin = base * BigInt(Math.round(policy.safetyMarginPercent * 100)) / BigInt(10000);
  const recommended = base + margin;
  const max = BigInt(policy.maxGasLimit);
  return recommended > max ? max : recommended;
};
