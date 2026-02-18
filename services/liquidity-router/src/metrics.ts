import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const deployedPrincipalGauge = new client.Gauge({
  name: "lge_deployed_principal",
  help: "Deployed principal tracked by the router (from L1 view)",
  labelNames: ["adapter", "asset"]
});

export const deployedPrincipal = new client.Gauge({
  name: "deployed_principal",
  help: "Deployed principal by chain/adapter/asset",
  labelNames: ["chain", "adapter", "asset"]
});

export const yieldSettledCounter = new client.Counter({
  name: "lge_yield_settled_total",
  help: "Total yield settled via SettlementOracle submissions (router attempted)",
  labelNames: ["adapter", "asset"]
});

export const yieldSettled = new client.Counter({
  name: "yield_settled",
  help: "Total yield settled by asset",
  labelNames: ["chain", "adapter", "asset"]
});

export const yieldAccrued = new client.Gauge({
  name: "yield_accrued",
  help: "Heuristic yield accrued (MVP placeholder)",
  labelNames: ["chain", "adapter", "asset"]
});

export const settlementLagGauge = new client.Gauge({
  name: "lge_settlement_lag_seconds",
  help: "Seconds since last settlement anchor per adapter (L1 view)",
  labelNames: ["adapter"]
});

export const settlementLagSeconds = new client.Gauge({
  name: "settlement_lag_seconds",
  help: "Settlement lag seconds per adapter",
  labelNames: ["chain", "adapter"]
});

export const policyViolationCounter = new client.Counter({
  name: "lge_policy_violations_total",
  help: "Policy / invariant violations detected off-chain",
  labelNames: ["type"]
});

export const policyViolationsTotal = new client.Counter({
  name: "policy_violations_total",
  help: "Policy violations total by type",
  labelNames: ["type"]
});

export const breakerStateGauge = new client.Gauge({
  name: "lge_breaker_state",
  help: "Circuit breaker state (1=paused) per adapter",
  labelNames: ["adapter"]
});

export const breakerState = new client.Gauge({
  name: "breaker_state",
  help: "Breaker state (1=paused) per adapter",
  labelNames: ["chain", "adapter"]
});

export const gravityIndexGauge = new client.Gauge({
  name: "lge_liquidity_gravity_index",
  help: "Heuristic Liquidity Gravity Index (yield_per_settlement / deployed_principal)",
  labelNames: ["adapter", "asset"]
});

export const riskScoreGauge = new client.Gauge({
  name: "lge_risk_score",
  help: "Router-computed risk score (0-1) for an adapter/external chain",
  labelNames: ["adapter", "externalChainId"]
});

export const externalRpcUpGauge = new client.Gauge({
  name: "lge_external_rpc_up",
  help: "External RPC health (1=up) for the selected endpoint",
  labelNames: ["externalChainId"]
});

export const externalRpcLatencyGauge = new client.Gauge({
  name: "lge_external_rpc_latency_ms",
  help: "External RPC latency (ms) for the selected endpoint",
  labelNames: ["externalChainId"]
});

export const externalRpcBlockAgeGauge = new client.Gauge({
  name: "lge_external_rpc_block_age_seconds",
  help: "Age (seconds) of the latest external block observed",
  labelNames: ["externalChainId"]
});

registry.registerMetric(deployedPrincipalGauge);
registry.registerMetric(deployedPrincipal);
registry.registerMetric(yieldSettledCounter);
registry.registerMetric(yieldSettled);
registry.registerMetric(yieldAccrued);
registry.registerMetric(settlementLagGauge);
registry.registerMetric(settlementLagSeconds);
registry.registerMetric(policyViolationCounter);
registry.registerMetric(policyViolationsTotal);
registry.registerMetric(breakerStateGauge);
registry.registerMetric(breakerState);
registry.registerMetric(gravityIndexGauge);
registry.registerMetric(riskScoreGauge);
registry.registerMetric(externalRpcUpGauge);
registry.registerMetric(externalRpcLatencyGauge);
registry.registerMetric(externalRpcBlockAgeGauge);
