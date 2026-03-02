/**
 * GhostContractAI — Prometheus Metrics
 *
 * Exposes /metrics for scraping by Prometheus.
 */

import client from "prom-client";

const register = new client.Registry();

client.collectDefaultMetrics({ register, prefix: "ghostcontract_ai_" });

// ─── Pipeline counters ───────────────────────────────────────────────────────

export const pipelineTotal = new client.Counter({
  name: "ghostcontract_ai_pipeline_total",
  help: "Total pipeline runs started, labelled by type and chain.",
  labelNames: ["type", "chain", "result"] as const,
  registers: [register],
});

export const pipelineActive = new client.Gauge({
  name: "ghostcontract_ai_pipeline_active",
  help: "Currently running pipelines.",
  labelNames: ["type"] as const,
  registers: [register],
});

export const pipelineDurationSeconds = new client.Histogram({
  name: "ghostcontract_ai_pipeline_duration_seconds",
  help: "Pipeline execution duration in seconds.",
  labelNames: ["type", "chain"] as const,
  buckets: [1, 5, 15, 30, 60, 120, 300],
  registers: [register],
});

// ─── Risk scores ─────────────────────────────────────────────────────────────

export const contractRiskScore = new client.Gauge({
  name: "ghostcontract_ai_risk_score",
  help: "Latest AI risk score for a contract (0-100).",
  labelNames: ["chain", "address", "name"] as const,
  registers: [register],
});

// ─── Routing law violations ──────────────────────────────────────────────────

export const routingLawViolations = new client.Counter({
  name: "ghostcontract_ai_routing_law_violations_total",
  help: "Number of routing law violations blocked by the service.",
  labelNames: ["from_chain", "to_chain"] as const,
  registers: [register],
});

// ─── Policy gate ─────────────────────────────────────────────────────────────

export const policyGateChecks = new client.Counter({
  name: "ghostcontract_ai_policy_gate_checks_total",
  help: "Policy gate checks, labelled by result.",
  labelNames: ["result", "namespace"] as const,
  registers: [register],
});

// ─── Evidence packs ──────────────────────────────────────────────────────────

export const evidencePacksGenerated = new client.Counter({
  name: "ghostcontract_ai_evidence_packs_total",
  help: "Evidence packs generated.",
  labelNames: ["chain"] as const,
  registers: [register],
});

// ─── Export ──────────────────────────────────────────────────────────────────

export async function getMetrics(): Promise<string> {
  return register.metrics();
}

export { register };
