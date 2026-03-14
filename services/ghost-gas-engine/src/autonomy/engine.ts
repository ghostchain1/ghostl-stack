import crypto from 'crypto';
import type { ChainConfig, GasPolicy } from '../config.js';
import { config } from '../config.js';
import type { SimulationResult } from '../services/simulator.js';
import type { AutonomyDecision, AutonomyMode, AutonomyOverrides, AutonomyForecast } from './types.js';
import { buildFeatures, predictOutcome } from './model.js';
import {
  getAutonomyOverrides,
  recordAutonomyDecision,
  recordAutonomyEvent,
  recordRiskForecast,
  recordPreventedFailure
} from './store.js';
import { query } from '../db/index.js';
import { recordAction, recordDecision as recordAiDecision } from '../ai-core/store.js';
import type { AiCoreMode } from '../ai-core/types.js';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const normalizeMode = (mode?: AutonomyMode | null): AutonomyMode =>
  mode === 'DRY_RUN' ? 'OBSERVE_ONLY' : (mode ?? 'ASSISTED');

export const resolveAutonomyConfig = (overrides?: AutonomyOverrides | null) => {
  return {
    enabled: overrides?.enabled ?? config.AUTONOMY_ENABLED,
    mode: normalizeMode((overrides?.mode as AutonomyMode | null) ?? (config.AUTONOMY_MODE as AutonomyMode)),
    maxRisk: overrides?.maxRisk ?? config.AUTONOMY_MAX_RISK,
    maxGasLimit: overrides?.maxGasLimit ?? config.AUTONOMY_MAX_GAS,
    maxRetries: overrides?.maxRetries ?? config.AUTONOMY_MAX_RETRIES,
    policyLock: overrides?.policyLock ?? config.AUTONOMY_POLICY_LOCK
  };
};

const fetchAttemptStats = async (chainKey: string) => {
  const attemptStats = await query<{
    total: string;
    failures: string;
    out_of_gas: string;
    avg_gas_used: string | null;
  }>(
    `SELECT COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE a.status <> 'success')::text as failures,
            COUNT(*) FILTER (WHERE a.classification = 'OUT_OF_GAS')::text as out_of_gas,
            AVG(a.gas_used)::text as avg_gas_used
     FROM gas_deployment_attempts a
     JOIN gas_deployments d ON d.id = a.deployment_id
     WHERE d.chain_key = $1`,
    [chainKey]
  );
  const deploymentCount = await query<{ total: string }>(
    'SELECT COUNT(*)::text as total FROM gas_deployments WHERE chain_key = $1',
    [chainKey]
  );
  const avgEstimate = await query<{ avg: string | null }>(
    'SELECT AVG(estimated_gas)::text as avg FROM gas_simulations WHERE chain_key = $1',
    [chainKey]
  );

  const totals = attemptStats[0];
  const attemptTotal = Number(totals?.total || 0);
  const failureTotal = Number(totals?.failures || 0);
  const outOfGas = Number(totals?.out_of_gas || 0);
  const avgGasUsed = totals?.avg_gas_used ? Number(totals.avg_gas_used) : 0;
  const deployments = Number(deploymentCount[0]?.total || 0);
  const avgEstimateValue = avgEstimate[0]?.avg ? Number(avgEstimate[0].avg) : 0;

  return {
    attemptTotal,
    failureTotal,
    outOfGas,
    avgGasUsed,
    deployments,
    avgEstimate: avgEstimateValue
  };
};

export const buildForecast = async (
  chain: ChainConfig,
  congestion: number
): Promise<AutonomyForecast> => {
  const stats = await fetchAttemptStats(chain.key);
  const failureRate = stats.attemptTotal ? stats.failureTotal / stats.attemptTotal : 0.1;
  const outOfGasRate = stats.attemptTotal ? stats.outOfGas / stats.attemptTotal : 0.05;
  const retriesPerDeployment = stats.deployments ? stats.attemptTotal / stats.deployments : 0;

  const features = buildFeatures({
    failureRate,
    outOfGasRate,
    congestion,
    avgGasUsed: stats.avgGasUsed,
    avgEstimate: stats.avgEstimate,
    retriesPerDeployment
  });

  const prediction = predictOutcome(features);
  const failureTypes = [
    features.outOfGasRate > 0.2 ? 'out_of_gas' : null,
    features.congestion > 0.7 ? 'congestion' : null,
    features.failureRate > 0.4 ? 'revert' : null
  ].filter(Boolean) as string[];

  return {
    id: crypto.randomUUID(),
    chainKey: chain.key,
    riskScore: prediction.riskScore,
    predictedFailureProbability: prediction.riskScore,
    failureTypes,
    confidence: prediction.confidence,
    features,
    createdAt: new Date().toISOString()
  };
};

export const runAutonomyDecision = async (input: {
  chain: ChainConfig;
  policy: GasPolicy;
  simulation: SimulationResult;
  mode?: AutonomyMode;
  deploymentId?: string;
}) => {
  const overrides = await getAutonomyOverrides();
  const settings = resolveAutonomyConfig(overrides);
  const mode = normalizeMode(input.mode ?? settings.mode);

  await recordAutonomyEvent(input.chain.key, 'observe', {
    chainId: input.chain.chainId,
    mode,
    enabled: settings.enabled
  });

  const blockLimit = input.simulation.blockGasLimit;
  const blockUsed = input.simulation.blockGasUsed;
  const congestion = blockLimit > BigInt(0) ? Number(blockUsed) / Number(blockLimit) : 0;
  const forecast = await buildForecast(input.chain, clamp(congestion, 0, 1));
  await recordRiskForecast(forecast);

  await recordAutonomyEvent(input.chain.key, 'predict', {
    forecastId: forecast.id,
    riskScore: forecast.riskScore,
    confidence: forecast.confidence
  });

  const riskScore = clamp(forecast.riskScore, 0, 1);
  const predictedSuccess = clamp(1 - riskScore, 0, 1);
  const confidence = clamp(forecast.confidence, 0, 1);

  let action: AutonomyDecision['action'] = 'submit';
  let status: AutonomyDecision['status'] = 'executed';
  const reasons: string[] = [];

  const isObserveOnly = !settings.enabled || mode === 'OBSERVE_ONLY';
  const isAdvisory = mode === 'ADVISORY';

  if (isObserveOnly) {
    action = 'observe_only';
    status = 'executed';
    reasons.push('autonomy_disabled');
  }

  if (riskScore >= settings.maxRisk) {
    if (mode === 'ASSISTED' || isAdvisory) {
      action = 'needs_approval';
      status = 'pending';
    } else if (mode === 'AUTONOMOUS_STRICT') {
      action = 'abort';
      status = 'blocked';
    } else if (mode === 'AUTONOMOUS') {
      action = 'abort';
      status = 'blocked';
    }
    reasons.push('risk_threshold_exceeded');
  }

  if (isAdvisory && action === 'submit') {
    action = 'needs_approval';
    status = 'pending';
    reasons.push('advisory_mode');
  }

  const riskBump = clamp(riskScore * 0.35, 0, 0.35);
  const baseGas = Number(input.simulation.recommendedGasLimit);
  const selectedGasLimit = Math.min(
    Math.round(baseGas * (1 + riskBump)),
    Math.min(settings.maxGasLimit, input.policy.maxGasLimit)
  );
  const selectedMaxRetries = Math.min(input.policy.retry.maxRetries, settings.maxRetries);

  const decision: AutonomyDecision = {
    id: crypto.randomUUID(),
    deploymentId: input.deploymentId ?? null,
    chainKey: input.chain.key,
    mode,
    action,
    status,
    riskScore,
    predictedSuccess,
    predictedGasUsed: forecast.features.avgGasUsed || Number(input.simulation.estimatedGas),
    selectedGasLimit,
    selectedMaxRetries,
    rationale: {
      reasons,
      predictedSuccess,
      congestion: forecast.features.congestion,
      failureRate: forecast.features.failureRate
    },
    confidence,
    createdAt: new Date().toISOString()
  };

  await recordAutonomyDecision(decision);
  const aiActionMap: Record<AutonomyDecision['action'], 'ALLOW' | 'BLOCK' | 'ESCALATE' | 'DEFER'> = {
    submit: 'ALLOW',
    abort: 'BLOCK',
    needs_approval: 'ESCALATE',
    observe_only: 'DEFER'
  };
  const aiMode = normalizeMode(mode) as AiCoreMode;
  const aiDecision = await recordAiDecision({
    chainKey: input.chain.key,
    mode: aiMode,
    action: aiActionMap[decision.action],
    status: decision.status,
    riskScore: decision.riskScore,
    confidence: decision.confidence,
    forecastId: forecast.id,
    deploymentId: decision.deploymentId ?? null,
    rationale: decision.rationale
  });
  await recordAction({
    decisionId: aiDecision.id,
    chainKey: input.chain.key,
    actionType: aiActionMap[decision.action],
    status: decision.status,
    payload: { autonomyDecisionId: decision.id }
  });
  await recordAutonomyEvent(input.chain.key, 'decide', {
    decisionId: decision.id,
    action: decision.action,
    status: decision.status,
    riskScore: decision.riskScore
  });

  if (decision.action === 'abort' || decision.action === 'needs_approval') {
    await recordPreventedFailure(
      input.chain.key,
      decision.action === 'abort' ? 'risk_block' : 'approval_required',
      decision.riskScore,
      decision.action,
      reasons.join(',')
    );
  }

  return { decision, settings, aiDecisionId: aiDecision.id };
};

export const recordAutonomyOutcome = async (chainKey: string, decisionId: string, outcome: Record<string, unknown>) => {
  await recordAutonomyEvent(chainKey, 'verify', { decisionId, outcome });
  await recordAutonomyEvent(chainKey, 'learn', { decisionId, outcome });
};
