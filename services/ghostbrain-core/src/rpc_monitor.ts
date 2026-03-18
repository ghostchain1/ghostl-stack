/**
 * GhostBrain — RPC Node Monitor
 *
 * Monitors the three GhostStack JSON-RPC endpoints:
 *   L1  :18545  (GhostChain Sovereign, ghost_ namespace)
 *   L2  :29547  (GhostL2 OP Stack)
 *   L3  :39545  (GhostL3 OP Stack)
 *
 * Tracks latency, block height drift, peer count, and RPC availability.
 * Emits memory events when nodes degrade so GhostBrain can act.
 */

import { store_event }        from "./memory_engine.js";
import { recordInfraSnapshot } from "./memory/infrastructure_memory.js";
import { log }                from "./observability/event_logger.js";
import { resolveRpcEndpoint, rpcBlockNumber } from "./rpc/compat.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SAMPLE_MS       = Number(process.env.RPC_MONITOR_SAMPLE_MS  ?? "10000");
const LATENCY_WARN_MS = Number(process.env.RPC_LATENCY_WARN_MS    ?? "2000");
const LATENCY_CRIT_MS = Number(process.env.RPC_LATENCY_CRIT_MS    ?? "5000");
const DRIFT_WARN      = Number(process.env.RPC_BLOCK_DRIFT_WARN   ?? "10");  // blocks

const ENDPOINTS = [
  { id: "l1-rpc",  url: resolveRpcEndpoint(["L1_RPC_URL", "GHOSTCHAIN_L1_RPC"], ["GHOST_L1_RPC_URLS"], "http://localhost:18545"), label: "GhostChain L1" },
  { id: "l2-rpc",  url: resolveRpcEndpoint(["L2_RPC_URL", "GHOSTCHAIN_L2_RPC"], ["GHOST_L2_RPC_URLS"], "http://localhost:29547"), label: "GhostL2" },
  { id: "l3-rpc",  url: resolveRpcEndpoint(["L3_RPC_URL", "GHOSTCHAIN_L3_RPC"], ["GHOST_L3_RPC_URLS"], "http://localhost:39545"), label: "GhostL3" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RpcNodeStatus {
  id:          string;
  label:       string;
  url:         string;
  blockNumber: number;
  latencyMs:   number;
  online:      boolean;
  errorCount:  number;
  sampledAt:   number;
}

// ── Internal state ─────────────────────────────────────────────────────────────

const _status    = new Map<string, RpcNodeStatus>();
const _errors    = new Map<string, number>();  // cumulative error counts
const _prevBlock = new Map<string, number>();  // for drift detection
let   _sampleCount = 0;
let   _timer: ReturnType<typeof setInterval> | null = null;

async function probeNode(id: string, url: string, label: string): Promise<void> {
  const t0 = Date.now();
  try {
    const probe = await rpcBlockNumber(url, 8_000);
    const latencyMs   = Date.now() - t0;
    const blockNumber = probe.blockNumber;
    const prevBlock   = _prevBlock.get(id) ?? blockNumber;
    const drift       = Math.abs(blockNumber - prevBlock);
    _prevBlock.set(id, blockNumber);

    const node: RpcNodeStatus = {
      id, label, url, blockNumber, latencyMs,
      online:     true,
      errorCount: _errors.get(id) ?? 0,
      sampledAt:  Date.now(),
    };
    _status.set(id, node);

    // Record in InfraMemory
    recordInfraSnapshot({
      ts:         Date.now(),
      resourceId: id,
      layer:      "service",
      cpuPct:     0,
      memPct:     0,
      diskIoPct:  0,
      netMbps:    0,
      restarts:   0,
      healthy:    latencyMs < LATENCY_WARN_MS,
      meta:       { blockNumber, latencyMs, label, drift },
    });

    // Emit events for degraded RPC
    if (latencyMs >= LATENCY_CRIT_MS) {
      store_event({
        resourceId: id,
        layer:      "service",
        category:   "performance",
        label:      "rpc_latency_critical",
        severity:   "critical",
        payload:    { latencyMs, url, nodeLabel: label },
      });
    } else if (latencyMs >= LATENCY_WARN_MS) {
      store_event({
        resourceId: id,
        layer:      "service",
        category:   "performance",
        label:      "rpc_latency_high",
        severity:   "warning",
        payload:    { latencyMs, url, nodeLabel: label },
      });
    }

    // Block drift alert (potential fork or stalled node)
    if (drift > DRIFT_WARN && prevBlock > 0) {
      store_event({
        resourceId: id,
        layer:      "service",
        category:   "consensus",
        label:      "block_drift_detected",
        severity:   "warning",
        payload:    { drift, blockNumber, prevBlock, nodeLabel: label },
      });
    }

    log.debug("rpc_monitor: probe_ok", `${id} block=${blockNumber} latency=${latencyMs}ms via=${probe.method}`);
  } catch (err) {
    const errorCount = (_errors.get(id) ?? 0) + 1;
    _errors.set(id, errorCount);

    const prev = _status.get(id);
    _status.set(id, {
      id, label, url,
      blockNumber: prev?.blockNumber ?? 0,
      latencyMs:   Date.now() - t0,
      online:      false,
      errorCount,
      sampledAt:   Date.now(),
    });

    store_event({
      resourceId: id,
      layer:      "service",
      category:   "health",
      label:      "rpc_offline",
      severity:   errorCount >= 3 ? "critical" : "warning",
      payload:    { error: String(err), errorCount, nodeLabel: label },
    });

    log.warn("rpc_monitor: probe_fail", `${id} — ${String(err)}`);
  }
}

async function sampleAll(): Promise<void> {
  _sampleCount++;
  await Promise.allSettled(
    ENDPOINTS.map(ep => probeNode(ep.id, ep.url, ep.label)),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getRpcStatus(): RpcNodeStatus[] {
  return [..._status.values()];
}

export function getOfflineNodes(): RpcNodeStatus[] {
  return [..._status.values()].filter(n => !n.online);
}

export function getRpcMonitorStats() {
  const nodes = [..._status.values()];
  return {
    sampleCount:   _sampleCount,
    intervalMs:    SAMPLE_MS,
    totalNodes:    nodes.length,
    onlineNodes:   nodes.filter(n => n.online).length,
    offlineNodes:  nodes.filter(n => !n.online).length,
    avgLatencyMs:  nodes.length > 0
      ? Math.round(nodes.reduce((s, n) => s + n.latencyMs, 0) / nodes.length)
      : 0,
    nodes,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startRpcMonitor(): void {
  if (_timer) return;
  void sampleAll();
  _timer = setInterval(() => void sampleAll(), SAMPLE_MS);
  log.info("rpc_monitor: started", `intervalMs=${SAMPLE_MS} endpoints=${ENDPOINTS.map(e => e.id).join(",")}`);
}

export function stopRpcMonitor(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  log.info("rpc_monitor: stopped", "RPC monitor halted");
}
