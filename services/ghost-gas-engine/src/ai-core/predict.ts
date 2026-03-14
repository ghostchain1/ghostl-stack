import type { ChainConfig } from '../config.js';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { buildFeatures, predictOutcome } from '../autonomy/model.js';
import { recordAiEvent, recordPrediction } from './store.js';
import type { AiCoreAction } from './types.js';

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

  return { attemptTotal, failureTotal, outOfGas, avgGasUsed, deployments, avgEstimate: avgEstimateValue };
};

const pickRecommendedAction = (riskScore: number, congestion: number): AiCoreAction => {
  if (riskScore >= 0.75 || congestion >= 0.85) return 'BLOCK';
  if (riskScore >= 0.55 || congestion >= 0.7) return 'MODIFY';
  if (riskScore >= 0.35) return 'RETRY';
  return 'ALLOW';
};

export const predictChainRisk = async (chain: ChainConfig, observation?: { gasLimit?: number | null; gasUsed?: number | null }) => {
  const stats = await fetchAttemptStats(chain.key);
  const gasLimit = observation?.gasLimit ?? 0;
  const gasUsed = observation?.gasUsed ?? 0;
  const congestion = gasLimit > 0 ? Math.min(gasUsed / gasLimit, 1) : 0;

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
  const recommendedAction = pickRecommendedAction(prediction.riskScore, features.congestion);
  const affectedSubsystem = features.congestion > 0.7 && chain.type !== 'L1' ? 'sequencer' : 'execution';

  const inserted = await recordPrediction({
    chainKey: chain.key,
    riskScore: prediction.riskScore,
    predictedFailureProbability: prediction.riskScore,
    confidence: prediction.confidence,
    timeHorizonSeconds: config.AUTONOMY_FORECAST_INTERVAL_SECONDS,
    affectedSubsystem,
    recommendedAction,
    features
  });

  await recordAiEvent(chain.key, 'predict', 'risk_forecast', {
    predictionId: inserted.id,
    riskScore: prediction.riskScore,
    recommendedAction
  });

  return {
    predictionId: inserted.id,
    riskScore: prediction.riskScore,
    confidence: prediction.confidence,
    recommendedAction,
    affectedSubsystem,
    features
  };
};
