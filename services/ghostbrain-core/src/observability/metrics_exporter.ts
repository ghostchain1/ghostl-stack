/**
 * GhostBrain — Metrics Exporter
 *
 * Maintains a lightweight in-process Prometheus-compatible gauge/counter
 * registry. Modules call inc(), set(), observe() to record values.
 * The /metrics route serialises these to Prometheus text format.
 *
 * Metric names should follow: ghostbrain_<subsystem>_<name>[_total|_seconds]
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type MetricType = "counter" | "gauge" | "histogram";

interface MetricDef {
  name:   string;
  help:   string;
  type:   MetricType;
  labels: Record<string, string>;
  value:  number;
  sum?:   number;   // histogram
  count?: number;   // histogram
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<string, MetricDef>();

function regKey(name: string, labels: Record<string, string>): string {
  const lStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).sort().join(",");
  return lStr ? `${name}{${lStr}}` : name;
}

function ensure(name: string, help: string, type: MetricType, labels: Record<string, string>): MetricDef {
  const k = regKey(name, labels);
  const existing = _registry.get(k);
  if (existing) return existing;
  const def: MetricDef = { name, help, type, labels, value: 0 };
  _registry.set(k, def);
  return def;
}

// ── Public mutation API ───────────────────────────────────────────────────────

/** Increment a counter by delta (default 1). */
export function inc(name: string, help: string, delta = 1, labels: Record<string, string> = {}): void {
  ensure(name, help, "counter", labels).value += delta;
}

/** Set a gauge to a specific value. */
export function set(name: string, help: string, value: number, labels: Record<string, string> = {}): void {
  ensure(name, help, "gauge", labels).value = value;
}

/** Record a histogram observation. */
export function observe(name: string, help: string, value: number, labels: Record<string, string> = {}): void {
  const m = ensure(name, help, "histogram", labels);
  m.value  = value;
  m.sum    = (m.sum ?? 0) + value;
  m.count  = (m.count ?? 0) + 1;
}

/** Snapshot all metric values (for observability route). */
export function snapshot(): { key: string; def: MetricDef }[] {
  return [..._registry.entries()].map(([key, def]) => ({ key, def }));
}

// ── Prometheus text serialisation ─────────────────────────────────────────────

/** Serialize registry to Prometheus text format (for /metrics endpoint). */
export function toPrometheusText(): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const [key, def] of _registry) {
    if (!seen.has(def.name)) {
      lines.push(`# HELP ${def.name} ${def.help}`);
      lines.push(`# TYPE ${def.name} ${def.type}`);
      seen.add(def.name);
    }
    if (def.type === "histogram") {
      const lStr = labelStr(def.labels);
      lines.push(`${def.name}_sum${lStr} ${def.sum ?? 0}`);
      lines.push(`${def.name}_count${lStr} ${def.count ?? 0}`);
    } else {
      lines.push(`${key} ${def.value}`);
    }
  }
  return lines.join("\n") + "\n";
}

function labelStr(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return parts.length > 0 ? `{${parts.join(",")}}` : "";
}

// ── Standard GhostBrain metrics (pre-declared) ────────────────────────────────

export function initStandardMetrics(): void {
  set("ghostbrain_memory_entries",    "Total memory entries in hot tier", 0);
  set("ghostbrain_infra_load_score",  "Composite infrastructure load score", 0);
  set("ghostbrain_ai_actions_total",  "Total autonomous AI actions taken", 0);
  set("ghostbrain_crash_prevention",  "Crash prevention actions taken this session", 0);
  set("ghostbrain_crash_prevention_total", "Crash prevention actions total (persistent)", 0);
  set("ghostbrain_self_heal_total",   "Self-healing actions total", 0);
  set("ghostbrain_collect_cycles",    "Number of observe/learn/decide cycles completed", 0);
  set("ghostbrain_cluster_nodes",     "Active cluster nodes", 0);
  set("ghostbrain_ai_decisions",      "AI decisions made this session", 0);
  set("ghostbrain_threshold_breaches","Active threshold breaches", 0);
  set("ghostbrain_stability_unstable","Resources in unstable state", 0);
  set("ghostbrain_queue_depth",       "Resource scheduler queue depth", 0);
  // Predictive AI
  set("ghostbrain_avg_tick_ms",          "Average predictive engine tick latency ms", 0);
  set("ghostbrain_active_failure_risks", "Active failure risk entries (elevated+)", 0);
  set("ghostbrain_memory_hot_entries",   "HOT tier (RAM) snapshot count", 0);
  set("ghostbrain_memory_warm_lines",    "WARM tier (NVMe) NDJSON line count", 0);
  set("ghostbrain_memory_archive_files", "COLD archive file count", 0);
  set("ghostbrain_prediction_cpu",       "Predicted CPU % at 30s horizon", 0);
  set("ghostbrain_prediction_memory",    "Predicted memory % at 30s horizon", 0);
  set("ghostbrain_failure_risk_score",   "Failure risk score 0-1", 0, { horizon: "30s" });
  set("ghostbrain_failure_risk_score",   "Failure risk score 0-1", 0, { horizon: "60s" });
  set("ghostbrain_failure_risk_score",   "Failure risk score 0-1", 0, { horizon: "120s" });
  set("ghostbrain_active_anomalies",     "Active anomalies by severity", 0, { severity: "critical" });
  set("ghostbrain_active_anomalies",     "Active anomalies by severity", 0, { severity: "high" });
  set("ghostbrain_active_anomalies",     "Active anomalies by severity", 0, { severity: "medium" });
  set("ghostbrain_active_anomalies",     "Active anomalies by severity", 0, { severity: "low" });
  set("ghostbrain_chain_alive",          "Chain RPC liveness (1=up, 0=down)", 0, { chain: "l1" });
  set("ghostbrain_chain_alive",          "Chain RPC liveness (1=up, 0=down)", 0, { chain: "l2" });
  set("ghostbrain_chain_alive",          "Chain RPC liveness (1=up, 0=down)", 0, { chain: "l3" });
  set("ghostbrain_chain_block_number",   "Latest observed block number", 0, { chain: "l1" });
  set("ghostbrain_chain_block_number",   "Latest observed block number", 0, { chain: "l2" });
  set("ghostbrain_chain_block_number",   "Latest observed block number", 0, { chain: "l3" });
  // Named counters — incremented by subsystems
  inc("ghostbrain_predictions_total",   "Total AI risk predictions generated", 0);
  inc("ghostbrain_repairs_total",       "Total autonomous repair actions attempted", 0, { success: "true" });
  inc("ghostbrain_repairs_total",       "Total autonomous repair actions attempted", 0, { success: "false" });
  inc("ghostbrain_memory_events_total", "Total events stored in memory engine", 0);
  inc("ghostbrain_agent_cycles_total",  "Agent tick cycles completed", 0, { agent: "optimizer" });
  inc("ghostbrain_agent_cycles_total",  "Agent tick cycles completed", 0, { agent: "predictor" });
  inc("ghostbrain_agent_cycles_total",  "Agent tick cycles completed", 0, { agent: "repair_bot" });
  inc("ghostbrain_agent_cycles_total",  "Agent tick cycles completed", 0, { agent: "load_balancer" });
  inc("ghostbrain_agent_cycles_total",  "Agent tick cycles completed", 0, { agent: "security_guardian" });
}

// ── Named counter increment helpers ──────────────────────────────────────────

/** Record one AI prediction emission. */
export function incPredictions(): void {
  inc("ghostbrain_predictions_total", "Total AI risk predictions generated");
}

/** Record one autonomous repair attempt. */
export function incRepairs(success: boolean): void {
  inc("ghostbrain_repairs_total", "Total autonomous repair actions attempted", 1, {
    success: success ? "true" : "false",
  });
}

/** Record one memory event stored. */
export function incMemoryEvents(): void {
  inc("ghostbrain_memory_events_total", "Total events stored in memory engine");
}

/** Record one agent tick cycle. */
export function incAgentCycles(agentName: string): void {
  inc("ghostbrain_agent_cycles_total", "Agent tick cycles completed", 1, { agent: agentName });
}
