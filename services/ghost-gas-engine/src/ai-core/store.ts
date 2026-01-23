import crypto from 'crypto';
import { query } from '../db/index.js';
import type {
  AiCoreAction,
  AiCoreActionRecord,
  AiCoreDecision,
  AiCoreObservation,
  AiCorePrediction,
  AiFailureFingerprint,
  AiGovernanceRecommendation,
  AiPolicyConstraints,
  AiRecoveryPlaybook,
  AiSuppressionRule
} from './types.js';

const fingerprintThreshold = 3;

export const recordAiEvent = async (chainKey: string, module: string, eventType: string, payload: Record<string, unknown>) => {
  await query(
    `INSERT INTO ai_core_events (chain_key, module, event_type, payload)
     VALUES ($1,$2,$3,$4)`,
    [chainKey, module, eventType, payload]
  );
};

export const recordObservation = async (observation: Omit<AiCoreObservation, 'id' | 'createdAt'>) => {
  const rows = await query<{ id: string; created_at: string }>(
    `INSERT INTO ai_chain_observations
     (chain_key, block_number, gas_limit, gas_used, base_fee, block_time, rpc_latency_ms, rpc_namespace, success, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, created_at`,
    [
      observation.chainKey,
      observation.blockNumber,
      observation.gasLimit,
      observation.gasUsed,
      observation.baseFee,
      observation.blockTime,
      observation.rpcLatencyMs,
      observation.rpcNamespace,
      observation.success,
      observation.errorMessage
    ]
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
};

export const recordPrediction = async (prediction: Omit<AiCorePrediction, 'id' | 'createdAt'>) => {
  const rows = await query<{ id: string; created_at: string }>(
    `INSERT INTO ai_risk_predictions
     (chain_key, risk_score, predicted_failure_probability, confidence, time_horizon_seconds,
      affected_subsystem, recommended_action, features)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, created_at`,
    [
      prediction.chainKey,
      prediction.riskScore,
      prediction.predictedFailureProbability,
      prediction.confidence,
      prediction.timeHorizonSeconds,
      prediction.affectedSubsystem,
      prediction.recommendedAction,
      prediction.features
    ]
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
};

export const recordDecision = async (decision: Omit<AiCoreDecision, 'id' | 'createdAt'>) => {
  const rows = await query<{ id: string; created_at: string }>(
    `INSERT INTO ai_core_decisions
     (chain_key, mode, action, status, risk_score, confidence, forecast_id, deployment_id, rationale)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, created_at`,
    [
      decision.chainKey,
      decision.mode,
      decision.action,
      decision.status,
      decision.riskScore,
      decision.confidence,
      decision.forecastId ?? null,
      decision.deploymentId ?? null,
      decision.rationale
    ]
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
};

export const recordAction = async (action: Omit<AiCoreActionRecord, 'id' | 'createdAt'>) => {
  const rows = await query<{ id: string; created_at: string }>(
    `INSERT INTO ai_core_actions
     (decision_id, chain_key, action_type, status, payload)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, created_at`,
    [action.decisionId ?? null, action.chainKey, action.actionType, action.status, action.payload]
  );
  return { id: rows[0].id, createdAt: rows[0].created_at };
};

export const recordFailureFingerprint = async (input: {
  chainKey: string;
  classification: string;
  errorSignature: string;
}) => {
  const signature = input.errorSignature || 'unknown';
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${input.chainKey}:${input.classification}:${signature}`)
    .digest('hex');

  const rows = await query<{ occurrences: number }>(
    `INSERT INTO ai_failure_fingerprints (fingerprint, chain_key, classification, error_signature, occurrences, last_seen)
     VALUES ($1,$2,$3,$4,1,now())
     ON CONFLICT (fingerprint) DO UPDATE
       SET occurrences = ai_failure_fingerprints.occurrences + 1,
           last_seen = now()
     RETURNING occurrences`,
    [fingerprint, input.chainKey, input.classification, signature]
  );

  const occurrences = Number(rows[0]?.occurrences || 1);
  if (occurrences >= fingerprintThreshold) {
    await query(
      `INSERT INTO ai_suppression_rules (fingerprint, chain_key, reason)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM ai_suppression_rules WHERE fingerprint = $1 AND active = true
       )`,
      [fingerprint, input.chainKey, `Repeated failure (${occurrences}x)`]
    );
  }

  return { fingerprint, occurrences };
};

export const recordGovernanceRecommendation = async (
  recommendation: Omit<AiGovernanceRecommendation, 'id' | 'status' | 'createdAt' | 'updatedAt'>
) => {
  const rows = await query<{ id: string; created_at: string; updated_at: string }>(
    `INSERT INTO ai_governance_recommendations
     (chain_key, category, severity, summary, recommendation)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, created_at, updated_at`,
    [
      recommendation.chainKey,
      recommendation.category,
      recommendation.severity,
      recommendation.summary,
      recommendation.recommendation
    ]
  );
  return { id: rows[0].id, createdAt: rows[0].created_at, updatedAt: rows[0].updated_at };
};

export const updateGovernanceRecommendation = async (id: string, status: string) => {
  await query(
    `UPDATE ai_governance_recommendations
     SET status = $1, updated_at = now()
     WHERE id = $2`,
    [status, id]
  );
};

export const getPolicyConstraints = async (chainKey: string): Promise<AiPolicyConstraints | null> => {
  const rows = await query<{
    chain_key: string;
    max_risk: string | null;
    max_gas_limit: string | null;
    max_retries: number | null;
    allowed_actions: AiCoreAction[] | null;
    created_at: string;
  }>(
    `SELECT chain_key, max_risk, max_gas_limit, max_retries, allowed_actions, created_at
     FROM ai_policy_constraints
     WHERE chain_key = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [chainKey]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    chainKey: row.chain_key,
    maxRisk: row.max_risk ? Number(row.max_risk) : null,
    maxGasLimit: row.max_gas_limit ? Number(row.max_gas_limit) : null,
    maxRetries: row.max_retries ?? null,
    allowedActions: row.allowed_actions ?? null,
    createdAt: row.created_at
  };
};

export const upsertPolicyConstraints = async (constraints: AiPolicyConstraints) => {
  await query(
    `INSERT INTO ai_policy_constraints (chain_key, max_risk, max_gas_limit, max_retries, allowed_actions)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      constraints.chainKey,
      constraints.maxRisk ?? null,
      constraints.maxGasLimit ?? null,
      constraints.maxRetries ?? null,
      constraints.allowedActions ?? null
    ]
  );
};

const listLimit = (limit?: number) => Math.min(Math.max(limit || 50, 1), 200);

export const listObservations = async (chainKey?: string, limit?: number) => {
  const values: Array<string | number> = [listLimit(limit)];
  const where = chainKey ? 'WHERE chain_key = $2' : '';
  if (chainKey) values.push(chainKey);
  return query(
    `SELECT id, chain_key, block_number, gas_limit, gas_used, base_fee, block_time, rpc_latency_ms, rpc_namespace,
            success, error_message, created_at
     FROM ai_chain_observations ${where}
     ORDER BY created_at DESC LIMIT $1`,
    values
  );
};

export const listPredictions = async (chainKey?: string, limit?: number) => {
  const values: Array<string | number> = [listLimit(limit)];
  const where = chainKey ? 'WHERE chain_key = $2' : '';
  if (chainKey) values.push(chainKey);
  return query(
    `SELECT id, chain_key, risk_score, predicted_failure_probability, confidence, time_horizon_seconds,
            affected_subsystem, recommended_action, features, created_at
     FROM ai_risk_predictions ${where}
     ORDER BY created_at DESC LIMIT $1`,
    values
  );
};

export const listDecisions = async (chainKey?: string, limit?: number) => {
  const values: Array<string | number> = [listLimit(limit)];
  const where = chainKey ? 'WHERE chain_key = $2' : '';
  if (chainKey) values.push(chainKey);
  return query(
    `SELECT id, chain_key, mode, action, status, risk_score, confidence, forecast_id, deployment_id, rationale, created_at
     FROM ai_core_decisions ${where}
     ORDER BY created_at DESC LIMIT $1`,
    values
  );
};

export const listActions = async (chainKey?: string, limit?: number) => {
  const values: Array<string | number> = [listLimit(limit)];
  const where = chainKey ? 'WHERE chain_key = $2' : '';
  if (chainKey) values.push(chainKey);
  return query(
    `SELECT id, decision_id, chain_key, action_type, status, payload, created_at
     FROM ai_core_actions ${where}
     ORDER BY created_at DESC LIMIT $1`,
    values
  );
};

export const listFingerprints = async (chainKey?: string, limit?: number) => {
  const values: Array<string | number> = [listLimit(limit)];
  const where = chainKey ? 'WHERE chain_key = $2' : '';
  if (chainKey) values.push(chainKey);
  return query(
    `SELECT fingerprint, chain_key, classification, error_signature, occurrences, first_seen, last_seen
     FROM ai_failure_fingerprints ${where}
     ORDER BY last_seen DESC LIMIT $1`,
    values
  );
};

export const listSuppressionRules = async (chainKey?: string, limit?: number) => {
  const values: Array<string | number> = [listLimit(limit)];
  const where = chainKey ? 'WHERE chain_key = $2' : '';
  if (chainKey) values.push(chainKey);
  return query(
    `SELECT id, fingerprint, chain_key, active, reason, created_at
     FROM ai_suppression_rules ${where}
     ORDER BY created_at DESC LIMIT $1`,
    values
  );
};

export const listPlaybooks = async (limit?: number) => {
  return query(
    `SELECT id, title, description, steps, created_at
     FROM ai_recovery_playbooks
     ORDER BY created_at DESC LIMIT $1`,
    [listLimit(limit)]
  );
};

export const listGovernanceRecommendations = async (chainKey?: string, status?: string, limit?: number) => {
  const values: Array<string | number> = [listLimit(limit)];
  const filters: string[] = [];
  if (chainKey) {
    filters.push('chain_key = $' + (values.length + 1));
    values.push(chainKey);
  }
  if (status) {
    filters.push('status = $' + (values.length + 1));
    values.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return query(
    `SELECT id, chain_key, category, severity, summary, recommendation, status, created_at, updated_at
     FROM ai_governance_recommendations ${where}
     ORDER BY created_at DESC LIMIT $1`,
    values
  );
};
