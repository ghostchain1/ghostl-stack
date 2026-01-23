import client from 'prom-client';

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const simulationsTotal = new client.Gauge({
  name: 'ghost_gas_simulations_total',
  help: 'Total gas simulations',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const deploymentsTotal = new client.Gauge({
  name: 'ghost_deployments_total',
  help: 'Total deployments',
  labelNames: ['chain', 'status'] as const,
  registers: [registry]
});

export const deploymentAttemptsTotal = new client.Gauge({
  name: 'ghost_deployment_attempts_total',
  help: 'Deployment attempts',
  labelNames: ['chain', 'result'] as const,
  registers: [registry]
});

export const outOfGasTotal = new client.Gauge({
  name: 'ghost_out_of_gas_total',
  help: 'Out of gas attempts',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const toolingBugTotal = new client.Gauge({
  name: 'ghost_tooling_bug_total',
  help: 'Tooling bug classifications',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const chainBugTotal = new client.Gauge({
  name: 'ghost_chain_bug_total',
  help: 'Chain config bug classifications',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const rpcErrorsTotal = new client.Gauge({
  name: 'ghost_rpc_errors_total',
  help: 'RPC errors',
  labelNames: ['chain', 'method'] as const,
  registers: [registry]
});

export const avgEstimatedGas = new client.Gauge({
  name: 'ghost_avg_estimated_gas',
  help: 'Average estimated gas',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const avgGasUsed = new client.Gauge({
  name: 'ghost_avg_gas_used',
  help: 'Average gas used',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const aiObservationsTotal = new client.Gauge({
  name: 'ghost_ai_observations_total',
  help: 'AI core observations',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const aiPredictionsTotal = new client.Gauge({
  name: 'ghost_ai_predictions_total',
  help: 'AI core predictions',
  labelNames: ['chain'] as const,
  registers: [registry]
});

export const aiDecisionsTotal = new client.Gauge({
  name: 'ghost_ai_decisions_total',
  help: 'AI core decisions',
  labelNames: ['chain', 'action'] as const,
  registers: [registry]
});

export const aiGovernanceTotal = new client.Gauge({
  name: 'ghost_ai_governance_total',
  help: 'AI core governance recommendations',
  labelNames: ['chain', 'status'] as const,
  registers: [registry]
});

export const metricsRegistry = registry;
