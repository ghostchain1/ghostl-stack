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
  set("ghostbrain_collect_cycles",    "Number of observe/learn/decide cycles completed", 0);
  set("ghostbrain_cluster_nodes",     "Active cluster nodes", 0);
  set("ghostbrain_ai_decisions",      "AI decisions made this session", 0);
  set("ghostbrain_threshold_breaches","Active threshold breaches", 0);
  set("ghostbrain_stability_unstable","Resources in unstable state", 0);
  set("ghostbrain_queue_depth",       "Resource scheduler queue depth", 0);
}
