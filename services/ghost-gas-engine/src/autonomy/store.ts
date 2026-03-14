import { query } from '../db/index.js';
import type { AutonomyDecision, AutonomyDecisionStatus, AutonomyOverrides, AutonomyForecast } from './types.js';

export const getAutonomyOverrides = async (): Promise<AutonomyOverrides | null> => {
  const rows = await query<{ enabled: boolean | null; mode: string | null; max_risk: string | null; max_gas_limit: string | null; max_retries: number | null; policy_lock: boolean | null; created_at: string }>(
    'SELECT enabled, mode, max_risk, max_gas_limit, max_retries, policy_lock, created_at FROM gas_autonomy_overrides ORDER BY created_at DESC LIMIT 1'
  );
  if (!rows[0]) return null;
  return {
    enabled: rows[0].enabled,
    mode: rows[0].mode as AutonomyOverrides['mode'],
    maxRisk: rows[0].max_risk ? Number(rows[0].max_risk) : null,
    maxGasLimit: rows[0].max_gas_limit ? Number(rows[0].max_gas_limit) : null,
    maxRetries: rows[0].max_retries,
    policyLock: rows[0].policy_lock,
    createdAt: rows[0].created_at
  };
};

export const saveAutonomyOverride = async (override: AutonomyOverrides) => {
  await query(
    `INSERT INTO gas_autonomy_overrides (enabled, mode, max_risk, max_gas_limit, max_retries, policy_lock)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      override.enabled ?? null,
      override.mode ?? null,
      override.maxRisk ?? null,
      override.maxGasLimit ?? null,
      override.maxRetries ?? null,
      override.policyLock ?? null
    ]
  );
};

export const recordAutonomyDecision = async (decision: AutonomyDecision) => {
  await query(
    `INSERT INTO gas_autonomy_decisions
     (id, deployment_id, chain_key, mode, action, status, risk_score, predicted_success, predicted_gas_used, selected_gas_limit, selected_max_retries, rationale, confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      decision.id,
      decision.deploymentId ?? null,
      decision.chainKey,
      decision.mode,
      decision.action,
      decision.status,
      decision.riskScore,
      decision.predictedSuccess,
      decision.predictedGasUsed ?? null,
      decision.selectedGasLimit ?? null,
      decision.selectedMaxRetries ?? null,
      decision.rationale,
      decision.confidence
    ]
  );
};

export const updateDecisionStatus = async (decisionId: string, status: AutonomyDecisionStatus) => {
  await query('UPDATE gas_autonomy_decisions SET status = $1 WHERE id = $2', [status, decisionId]);
};

export const getDecisionById = async (decisionId: string): Promise<AutonomyDecision | null> => {
  const rows = await query<{
    id: string;
    deployment_id: string | null;
    chain_key: string;
    mode: string;
    action: string;
    status: string;
    risk_score: string;
    predicted_success: string;
    predicted_gas_used: string | null;
    selected_gas_limit: string | null;
    selected_max_retries: number | null;
    rationale: Record<string, unknown>;
    confidence: string;
    created_at: string;
  }>(
    `SELECT id, deployment_id, chain_key, mode, action, status, risk_score, predicted_success, predicted_gas_used,
            selected_gas_limit, selected_max_retries, rationale, confidence, created_at
     FROM gas_autonomy_decisions WHERE id = $1`,
    [decisionId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    deploymentId: row.deployment_id,
    chainKey: row.chain_key,
    mode: row.mode as AutonomyDecision['mode'],
    action: row.action as AutonomyDecision['action'],
    status: row.status as AutonomyDecision['status'],
    riskScore: Number(row.risk_score),
    predictedSuccess: Number(row.predicted_success),
    predictedGasUsed: row.predicted_gas_used ? Number(row.predicted_gas_used) : null,
    selectedGasLimit: row.selected_gas_limit ? Number(row.selected_gas_limit) : null,
    selectedMaxRetries: row.selected_max_retries ?? null,
    rationale: row.rationale || {},
    confidence: Number(row.confidence),
    createdAt: row.created_at
  };
};

export const recordAutonomyEvent = async (chainKey: string, eventType: string, payload: Record<string, unknown>) => {
  await query('INSERT INTO gas_autonomy_events (chain_key, event_type, payload) VALUES ($1,$2,$3)', [
    chainKey,
    eventType,
    payload
  ]);
};

export const recordRiskForecast = async (forecast: AutonomyForecast) => {
  await query(
    `INSERT INTO gas_risk_forecasts (id, chain_key, risk_score, predicted_failure_probability, failure_types, confidence, features)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      forecast.id,
      forecast.chainKey,
      forecast.riskScore,
      forecast.predictedFailureProbability,
      forecast.failureTypes,
      forecast.confidence,
      forecast.features
    ]
  );
};

export const recordPolicyHistory = async (
  chainKey: string,
  version: string,
  policy: Record<string, unknown>,
  appliedBy: string,
  status: string,
  metrics: Record<string, unknown>
) => {
  await query(
    `INSERT INTO gas_policy_history (chain_key, version, policy, applied_by, status, metrics)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [chainKey, version, policy, appliedBy, status, metrics]
  );
};

export const recordPolicyDrift = async (
  chainKey: string,
  baseMultiplier: number,
  safetyMarginPercent: number,
  retryMultiplierStep: number,
  reason: string
) => {
  await query(
    `INSERT INTO gas_policy_drift (chain_key, base_multiplier, safety_margin_percent, retry_multiplier_step, reason)
     VALUES ($1,$2,$3,$4,$5)`,
    [chainKey, baseMultiplier, safetyMarginPercent, retryMultiplierStep, reason]
  );
};

export const recordPreventedFailure = async (
  chainKey: string,
  failureType: string,
  riskScore: number,
  action: string,
  reason: string
) => {
  await query(
    `INSERT INTO gas_prevented_failures (chain_key, failure_type, risk_score, action, reason)
     VALUES ($1,$2,$3,$4,$5)`,
    [chainKey, failureType, riskScore, action, reason]
  );
};
