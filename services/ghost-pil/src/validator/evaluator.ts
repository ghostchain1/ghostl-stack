import { readFileSync } from 'fs';
import { config } from '../config.js';
import { pool } from '../db/index.js';

export type ValidatorConfig = {
  id: string;
  chainId: number;
  jurisdictionCode: string;
};

const loadValidators = (): ValidatorConfig[] => {
  const raw = JSON.parse(readFileSync(config.PIL_VALIDATOR_CONFIG_PATH, 'utf-8')) as { validators: ValidatorConfig[] };
  return raw.validators || [];
};

const clampScore = (score: number) => Math.max(0, Math.min(100, score));

export const evaluateValidatorScores = async () => {
  const validators = loadValidators();
  if (!validators.length) return;

  for (const validator of validators) {
    const stateRes = await pool.query<{ last_error: string | null }>(
      'SELECT last_error FROM pil_chain_state WHERE chain_id = $1',
      [validator.chainId]
    );
    const errorPenalty = stateRes.rows[0]?.last_error ? 15 : 0;

    const policyRes = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM pil_policy_packs WHERE status = 'active'",
      []
    );
    const hasPolicies = Number(policyRes.rows[0]?.count || 0) > 0;
    const policyPenalty = hasPolicies ? 0 : 10;

    const score = clampScore(100 - errorPenalty - policyPenalty);
    const reason = errorPenalty ? 'rpc_error_detected' : 'policy_ok';

    await pool.query(
      `INSERT INTO pil_validator_scores (validator_id, chain_id, jurisdiction_code, score, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (validator_id, chain_id) DO UPDATE
       SET score = EXCLUDED.score,
           reason = EXCLUDED.reason,
           updated_at = NOW()` ,
      [validator.id, validator.chainId, validator.jurisdictionCode, score, reason]
    );
  }
};
