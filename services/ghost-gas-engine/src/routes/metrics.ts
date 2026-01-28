import type { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';
import {
  metricsRegistry,
  deploymentsTotal,
  deploymentAttemptsTotal,
  outOfGasTotal,
  toolingBugTotal,
  chainBugTotal,
  simulationsTotal,
  avgEstimatedGas,
  avgGasUsed,
  rpcErrorsTotal,
  aiObservationsTotal,
  aiPredictionsTotal,
  aiDecisionsTotal,
  aiGovernanceTotal
} from '../metrics/metrics.js';

export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get('/metrics', async (_req, reply) => {
    const simulationCounts = await query<{ chain_key: string; count: string }>(
      'SELECT chain_key, COUNT(*)::text as count FROM gas_simulations GROUP BY chain_key'
    );
    simulationsTotal.reset();
    simulationCounts.forEach((row) => simulationsTotal.labels(row.chain_key).set(Number(row.count)));

    const deploymentCounts = await query<{ chain_key: string; status: string; count: string }>(
      'SELECT chain_key, status, COUNT(*)::text as count FROM gas_deployments GROUP BY chain_key, status'
    );
    deploymentsTotal.reset();
    deploymentCounts.forEach((row) => deploymentsTotal.labels(row.chain_key, row.status).set(Number(row.count)));

    const attemptCounts = await query<{ chain_key: string; classification: string; count: string }>(
      `SELECT d.chain_key, a.classification, COUNT(*)::text as count
       FROM gas_deployment_attempts a
       JOIN gas_deployments d ON d.id = a.deployment_id
       GROUP BY d.chain_key, a.classification`
    );
    deploymentAttemptsTotal.reset();
    attemptCounts.forEach((row) => deploymentAttemptsTotal.labels(row.chain_key, row.classification || 'unknown').set(Number(row.count)));

    const outOfGasCounts = attemptCounts.filter((row) => row.classification === 'OUT_OF_GAS');
    outOfGasTotal.reset();
    outOfGasCounts.forEach((row) => outOfGasTotal.labels(row.chain_key).set(Number(row.count)));

    const toolingCounts = attemptCounts.filter((row) => row.classification === 'TOOLING_BUG');
    toolingBugTotal.reset();
    toolingCounts.forEach((row) => toolingBugTotal.labels(row.chain_key).set(Number(row.count)));

    const chainBugCounts = attemptCounts.filter((row) => row.classification === 'CHAIN_CONFIG_BUG');
    chainBugTotal.reset();
    chainBugCounts.forEach((row) => chainBugTotal.labels(row.chain_key).set(Number(row.count)));

    const avgGasUsedRows = await query<{ chain_key: string; avg: string }>(
      `SELECT d.chain_key, AVG(a.gas_used) as avg
       FROM gas_deployment_attempts a
       JOIN gas_deployments d ON d.id = a.deployment_id
       WHERE a.gas_used IS NOT NULL
       GROUP BY d.chain_key`
    );
    avgGasUsed.reset();
    avgGasUsedRows.forEach((row) => avgGasUsed.labels(row.chain_key).set(Number(row.avg)));

    const avgEstimateRows = await query<{ chain_key: string; avg: string }>(
      'SELECT chain_key, AVG(estimated_gas) as avg FROM gas_simulations GROUP BY chain_key'
    );
    avgEstimatedGas.reset();
    avgEstimateRows.forEach((row) => avgEstimatedGas.labels(row.chain_key).set(Number(row.avg)));

    const observationCounts = await query<{ chain_key: string; count: string }>(
      'SELECT chain_key, COUNT(*)::text as count FROM ai_chain_observations GROUP BY chain_key'
    );
    aiObservationsTotal.reset();
    observationCounts.forEach((row) => aiObservationsTotal.labels(row.chain_key).set(Number(row.count)));

    const predictionCounts = await query<{ chain_key: string; count: string }>(
      'SELECT chain_key, COUNT(*)::text as count FROM ai_risk_predictions GROUP BY chain_key'
    );
    aiPredictionsTotal.reset();
    predictionCounts.forEach((row) => aiPredictionsTotal.labels(row.chain_key).set(Number(row.count)));

    const decisionCounts = await query<{ chain_key: string; action: string; count: string }>(
      'SELECT chain_key, action, COUNT(*)::text as count FROM ai_core_decisions GROUP BY chain_key, action'
    );
    aiDecisionsTotal.reset();
    decisionCounts.forEach((row) => aiDecisionsTotal.labels(row.chain_key, row.action).set(Number(row.count)));

    const governanceCounts = await query<{ chain_key: string; status: string; count: string }>(
      'SELECT chain_key, status, COUNT(*)::text as count FROM ai_governance_recommendations GROUP BY chain_key, status'
    );
    aiGovernanceTotal.reset();
    governanceCounts.forEach((row) => aiGovernanceTotal.labels(row.chain_key, row.status).set(Number(row.count)));

    rpcErrorsTotal.reset();
    reply.header('content-type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });

  app.get('/v1/metrics/summary', async () => {
    const deployments = await query<{ chain_key: string; status: string; count: string }>(
      'SELECT chain_key, status, COUNT(*)::text as count FROM gas_deployments GROUP BY chain_key, status'
    );
    const attempts = await query<{ chain_key: string; count: string }>(
      `SELECT d.chain_key, COUNT(*)::text as count
       FROM gas_deployment_attempts a
       JOIN gas_deployments d ON d.id = a.deployment_id
       GROUP BY d.chain_key`
    );
    const outOfGas = await query<{ chain_key: string; count: string }>(
      `SELECT d.chain_key, COUNT(*)::text as count
       FROM gas_deployment_attempts a
       JOIN gas_deployments d ON d.id = a.deployment_id
       WHERE a.classification = 'OUT_OF_GAS'
       GROUP BY d.chain_key`
    );
    const avgGasUsed = await query<{ chain_key: string; avg: string }>(
      `SELECT d.chain_key, AVG(a.gas_used) as avg
       FROM gas_deployment_attempts a
       JOIN gas_deployments d ON d.id = a.deployment_id
       WHERE a.gas_used IS NOT NULL
       GROUP BY d.chain_key`
    );
    const avgEstimate = await query<{ chain_key: string; avg: string }>(
      'SELECT chain_key, AVG(estimated_gas) as avg FROM gas_simulations GROUP BY chain_key'
    );

    return {
      deployments,
      attempts,
      outOfGas,
      avgGasUsed,
      avgEstimate
    };
  });
}
