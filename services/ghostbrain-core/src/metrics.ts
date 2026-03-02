/**
 * GhostBrain Core — Prometheus Metrics
 */

import { Registry, Counter, Gauge, Histogram } from "prom-client";
import { SERVICE_NAME, VERSION } from "./config.js";

export const registry = new Registry();

registry.setDefaultLabels({ service: SERVICE_NAME, version: VERSION });

// ─── Brain loop ───────────────────────────────────────────────────────────────
export const brainTickTotal = new Counter({
  name: "ghostbrain_tick_total",
  help: "Total number of brain tick loop iterations",
  registers: [registry],
});

export const brainTickDuration = new Histogram({
  name: "ghostbrain_tick_duration_seconds",
  help: "Duration of each brain tick",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

// ─── Incidents ────────────────────────────────────────────────────────────────
export const incidentsOpened = new Counter({
  name: "ghostbrain_incidents_opened_total",
  help: "Total incidents opened",
  labelNames: ["severity"] as const,
  registers: [registry],
});

export const incidentsResolved = new Counter({
  name: "ghostbrain_incidents_resolved_total",
  help: "Total incidents resolved",
  labelNames: ["severity", "outcome"] as const,
  registers: [registry],
});

export const activeIncidents = new Gauge({
  name: "ghostbrain_active_incidents",
  help: "Currently open incidents",
  labelNames: ["severity"] as const,
  registers: [registry],
});

// ─── Plans ────────────────────────────────────────────────────────────────────
export const plansGenerated = new Counter({
  name: "ghostbrain_plans_generated_total",
  help: "Total change plans generated",
  registers: [registry],
});

export const plansBlocked = new Counter({
  name: "ghostbrain_plans_blocked_by_policy_total",
  help: "Plans blocked by policy gatekeeper",
  labelNames: ["reason"] as const,
  registers: [registry],
});

export const plansExecuted = new Counter({
  name: "ghostbrain_plans_executed_total",
  help: "Plans that reached execution",
  labelNames: ["outcome"] as const,
  registers: [registry],
});

// ─── Routing law ─────────────────────────────────────────────────────────────
export const routingLawViolations = new Counter({
  name: "ghostbrain_routing_law_violations_total",
  help: "Routing law violations detected and rejected",
  labelNames: ["from_layer", "to_layer"] as const,
  registers: [registry],
});

// ─── Agents ───────────────────────────────────────────────────────────────────
export const registeredAgents = new Gauge({
  name: "ghostbrain_registered_agents",
  help: "Number of registered agents",
  labelNames: ["role"] as const,
  registers: [registry],
});

export const taskTokensIssued = new Counter({
  name: "ghostbrain_task_tokens_issued_total",
  help: "Task tokens issued to agents",
  labelNames: ["role", "capability"] as const,
  registers: [registry],
});

// ─── Health graph ─────────────────────────────────────────────────────────────
export const healthGraphNodes = new Gauge({
  name: "ghostbrain_health_graph_nodes",
  help: "Total nodes in the health graph",
  labelNames: ["health"] as const,
  registers: [registry],
});

export const anomalySignals = new Counter({
  name: "ghostbrain_anomaly_signals_total",
  help: "Anomaly signals ingested",
  labelNames: ["source", "layer"] as const,
  registers: [registry],
});

// ─── Canary ───────────────────────────────────────────────────────────────────
export const canaryOutcomes = new Counter({
  name: "ghostbrain_canary_outcomes_total",
  help: "Canary rollout outcomes",
  labelNames: ["status"] as const,
  registers: [registry],
});

// ─── Rollbacks ────────────────────────────────────────────────────────────────
export const rollbacksTriggered = new Counter({
  name: "ghostbrain_rollbacks_triggered_total",
  help: "Automatic rollbacks triggered",
  labelNames: ["reason"] as const,
  registers: [registry],
});
