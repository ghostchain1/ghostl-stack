/**
 * Prometheus metrics for ghost-ai-swarm (prom-client).
 */
import client from "prom-client";

export const register = new client.Registry();
register.setDefaultLabels({ service: "ghost-ai-swarm" });
client.collectDefaultMetrics({ register });

export const SWARM_EVENTS_TOTAL = new client.Counter({
  name: "swarm_events_total",
  help: "Total events emitted on the swarm bus",
  labelNames: ["event"] as const,
  registers: [register],
});

export const SWARM_AGENT_RUNS_TOTAL = new client.Counter({
  name: "swarm_agent_runs_total",
  help: "Total task runs per agent",
  labelNames: ["agent", "outcome"] as const,
  registers: [register],
});

export const SWARM_AGENT_DURATION_SECONDS = new client.Histogram({
  name: "swarm_agent_duration_seconds",
  help: "Agent task processing duration",
  labelNames: ["agent"] as const,
  buckets: [0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const SWARM_DRY_RUN_TOTAL = new client.Counter({
  name: "swarm_dry_run_total",
  help: "Tasks that ran in dry-run mode (no write)",
  labelNames: ["agent"] as const,
  registers: [register],
});

export const SWARM_UPSTREAM_ERRORS_TOTAL = new client.Counter({
  name: "swarm_upstream_errors_total",
  help: "Errors calling upstream services (GhostBrain, GACK, GNMC, relay)",
  labelNames: ["agent", "upstream"] as const,
  registers: [register],
});

export const SWARM_HEALTH_SCORE = new client.Gauge({
  name: "swarm_health_score",
  help: "Aggregate swarm health score 0-100",
  registers: [register],
});
