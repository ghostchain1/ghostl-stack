/**
 * GhostBrain Core — Telemetry Ingestion
 *
 * Ingests metrics from:
 *   • Prometheus (scrape endpoint or push gateway)
 *   • Docker stats (via unix socket — same as docker_controller)
 *   • VM metrics  (via hypervisor controller API)
 *   • System logs (process.stdout capture + structured log tailing)
 *   • GhostChain node logs (L1/L2/L3 RPC health endpoints)
 *
 * All ingested telemetry is forwarded to memory_engine.store_event() and
 * record_infra_snapshot() so it becomes available for pattern analysis,
 * failure prediction, and memory recall.
 *
 * Performance target: < 50 ms per batch ingestion cycle.
 */

import { request }              from "undici";
import { store_event, record_infra_snapshot } from "./memory_engine.js";
import { log }                  from "./observability/event_logger.js";
import { resolveRpcEndpoint, rpcAlive } from "./rpc/compat.js";

// ── Config ────────────────────────────────────────────────────────────────────

const PROMETHEUS_URL   = process.env.PROMETHEUS_URL      ?? "http://localhost:9090";
const DOCKER_HTTP      = process.env.DOCKER_HTTP         ?? "";
const DOCKER_SOCKET    = process.env.DOCKER_SOCKET       ?? "unix:///var/run/docker.sock";
const L1_RPC           = resolveRpcEndpoint(["GHOSTCHAIN_L1_RPC"], ["GHOST_L1_RPC_URLS"], "http://localhost:18545");
const L2_RPC           = resolveRpcEndpoint(["GHOSTCHAIN_L2_RPC"], ["GHOST_L2_RPC_URLS"], "http://localhost:29547");
const L3_RPC           = resolveRpcEndpoint(["GHOSTCHAIN_L3_RPC"], ["GHOST_L3_RPC_URLS"], "http://localhost:39545");
const SCRAPE_INTERVAL  = Number(process.env.TELEMETRY_SCRAPE_MS ?? "15000");  // 15 s

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function httpGet(url: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const res = await request(url, {
      method: "GET",
      bodyTimeout: timeoutMs,
    });
    if (res.statusCode !== 200) return null;
    return await res.body.text();
  } catch {
    return null;
  }
}

async function dockerGet<T>(path: string): Promise<T | null> {
  try {
    const socketPath = DOCKER_HTTP ? undefined : DOCKER_SOCKET.replace(/^unix:\/\//, "");
    const origin     = DOCKER_HTTP || "http://localhost";
    const opts = {
      path,
      method: "GET" as const,
      headers: { Host: "docker" },
      bodyTimeout: 5_000,
      ...(socketPath ? { socketPath } : {}),
    };
    const res = await request(origin, opts);
    if (res.statusCode !== 200) return null;
    return JSON.parse(await res.body.text()) as T;
  } catch {
    return null;
  }
}

// ── Prometheus scraping ───────────────────────────────────────────────────────

/**
 * Parse Prometheus text format for a specific metric name.
 * Returns array of { labels, value } objects.
 */
function parsePrometheusMetric(text: string, metricName: string): Array<{ labels: Record<string, string>; value: number }> {
  const results: Array<{ labels: Record<string, string>; value: number }> = [];
  const regex = new RegExp(`^${metricName}(?:\\{([^}]*)\\})?\\s+([\\d.eE+\\-]+)`, "gm");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const labelsStr = m[1] ?? "";
    const value     = parseFloat(m[2] ?? "NaN");
    if (isNaN(value)) continue;
    const labels: Record<string, string> = {};
    for (const pair of labelsStr.split(",")) {
      const [k, v] = pair.split("=");
      if (k && v) labels[k.trim()] = v.trim().replace(/^"|"$/g, "");
    }
    results.push({ labels, value });
  }
  return results;
}

async function scrapePrometheus(): Promise<void> {
  const text = await httpGet(`${PROMETHEUS_URL}/metrics`);
  if (!text) return;

  // CPU usage
  const cpuMetrics = parsePrometheusMetric(text, "process_cpu_seconds_total");
  for (const m of cpuMetrics.slice(0, 10)) {
    const resourceId = m.labels.job ?? m.labels.instance ?? "prometheus";
    store_event({
      resourceId,
      layer:    "service",
      category: "metrics",
      label:    "prometheus_cpu",
      payload:  { value: m.value, labels: m.labels },
    });
  }

  // Memory usage
  const memMetrics = parsePrometheusMetric(text, "process_resident_memory_bytes");
  for (const m of memMetrics.slice(0, 10)) {
    const resourceId = m.labels.job ?? m.labels.instance ?? "prometheus";
    const memMb      = m.value / (1024 * 1024);
    store_event({
      resourceId,
      layer:    "service",
      category: "metrics",
      label:    memMb > 500 ? "mem_high" : "mem_normal",
      payload:  { memMb, labels: m.labels },
    });
  }
}

// ── Docker stats ingestion ────────────────────────────────────────────────────

interface DockerContainer {
  Id:   string;
  Names: string[];
  Status: string;
  RestartCount?: number;
}

interface DockerStats {
  cpu_stats:    { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
  memory_stats: { usage?: number; limit?: number };
  networks?:    Record<string, { rx_bytes: number; tx_bytes: number }>;
}

async function scrapeDockerMetrics(): Promise<void> {
  const containers = await dockerGet<DockerContainer[]>("/containers/json");
  if (!containers) return;

  await Promise.all(containers.slice(0, 20).map(async (c) => {
    const stats = await dockerGet<DockerStats>(`/containers/${c.Id}/stats?stream=false`);
    if (!stats) return;

    const cpuDelta    = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const sysDelta    = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const numCpus     = stats.cpu_stats.online_cpus ?? 1;
    const cpuPct      = sysDelta > 0 ? (cpuDelta / sysDelta) * numCpus * 100 : 0;
    const memPct      = stats.memory_stats.limit
      ? (stats.memory_stats.usage ?? 0) / stats.memory_stats.limit * 100 : 0;
    const name        = c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12);

    record_infra_snapshot({
      resourceId: name,
      layer:      "container",
      cpuPct:     Math.min(cpuPct, 100),
      memPct:     Math.min(memPct, 100),
      restarts:   c.RestartCount ?? 0,
      healthy:    c.Status.startsWith("Up"),
    });
  }));
}

// ── GhostChain node health ────────────────────────────────────────────────────

async function scrapeChainNodes(): Promise<void> {
  const nodes = [
    { id: "ghostchain-l1", url: L1_RPC, chainId: 14000101 },
    { id: "ghostchain-l2", url: L2_RPC, chainId: 901 },
    { id: "ghostchain-l3", url: L3_RPC, chainId: 903 },
  ];

  await Promise.all(nodes.map(async (node) => {
    const start = Date.now();
    try {
      const probe = await rpcAlive(node.url, 3_000);
      const latencyMs = Date.now() - start;
      const ok        = probe.alive;

      store_event({
        resourceId: node.id,
        layer:      "chain",
        category:   "health",
        label:      ok ? "rpc_ok" : "rpc_error",
        severity:   ok ? "info" : "warning",
        payload:    {
          latencyMs,
          chainId: node.chainId,
          method: probe.method,
          blockNumber: probe.blockNumber,
          error: probe.error,
        },
      });
    } catch {
      store_event({
        resourceId: node.id,
        layer:      "chain",
        category:   "health",
        label:      "rpc_unreachable",
        severity:   "warning",
        payload:    { chainId: node.chainId },
      });
    }
  }));
}

// ── Main loop ─────────────────────────────────────────────────────────────────

let _interval: ReturnType<typeof setInterval> | null = null;

export function startTelemetryIngestion(): void {
  if (_interval) return;

  async function cycle() {
    const t0 = Date.now();
    await Promise.allSettled([
      scrapePrometheus(),
      scrapeDockerMetrics(),
      scrapeChainNodes(),
    ]);
    const elapsed = Date.now() - t0;
    if (elapsed > 5_000) log.warn("telemetry_ingest: slow_cycle", `elapsed=${elapsed}ms`);
    else log.debug("telemetry_ingest: cycle_done", `elapsed=${elapsed}ms`);
  }

  void cycle();
  _interval = setInterval(() => void cycle(), SCRAPE_INTERVAL);
  log.info("telemetry_ingest: started", `intervalMs=${SCRAPE_INTERVAL}`);
}

export function stopTelemetryIngestion(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

// ── On-demand snapshot ────────────────────────────────────────────────────────

export async function runTelemetryCycleOnce(): Promise<void> {
  await Promise.allSettled([
    scrapePrometheus(),
    scrapeDockerMetrics(),
    scrapeChainNodes(),
  ]);
}
