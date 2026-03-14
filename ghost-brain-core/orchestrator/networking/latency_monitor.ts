/**
 * GhostBrain Global Orchestrator — Latency Monitor
 *
 * Measures round-trip latency from the orchestrator to every registered node
 * by timing an HTTP HEAD request to the node's admin health endpoint.
 *
 * Results are:
 *   1. Written back to the GhostNode entries in NodeRegistry.
 *   2. Used to update RegionIndex average latencies.
 *   3. Returned as LatencyProbeResult[] for the GlobalController tick summary.
 *
 * SECURITY: This module uses real HTTP timing — NOT Math.random().
 * All URLs are constructed from registry-validated host/port pairs;
 * no user input is interpolated.
 */

import type { LatencyProbeResult } from "../types.js";
import type { NodeRegistry }        from "../discovery/node_registry.js";
import type { RegionIndex }         from "../discovery/region_index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = parseInt(
  process.env["LATENCY_PROBE_TIMEOUT_MS"] ?? "2000", 10,
);

const PROBE_INTERVAL_MS = parseInt(
  process.env["LATENCY_PROBE_INTERVAL_MS"] ?? "15000", 10,
);

/** Ewma smoothing factor for latency updates (0=no smoothing, 1=no history). */
const EWMA_ALPHA = parseFloat(
  process.env["LATENCY_EWMA_ALPHA"] ?? "0.3",
);

const SAFE_HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}$/;

// ---------------------------------------------------------------------------
// LatencyMonitor
// ---------------------------------------------------------------------------

export class LatencyMonitor {
  private intervalRef?: ReturnType<typeof setInterval>;
  private running       = false;

  constructor(
    private readonly registry:    NodeRegistry,
    private readonly regionIndex: RegionIndex,
  ) {}

  /** Start periodic probing. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalRef = setInterval(
      () => this.probeAll().catch(e => console.error("[latency]", e)),
      PROBE_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = undefined;
    }
    this.running = false;
  }

  /**
   * Probe all registered nodes in parallel and flush results back to registry
   * and region index.  Returns the full probe result list.
   */
  async probeAll(): Promise<LatencyProbeResult[]> {
    const nodes = this.registry.getAll();

    const results = await Promise.allSettled(
      nodes.map(node => this.probe(node.id, node.host, node.adminPort ?? node.rpcPort + 1)),
    );

    const probeResults: LatencyProbeResult[] = [];
    const regionLatencies = new Map<string, number[]>();

    for (let i = 0; i < nodes.length; i++) {
      const node   = nodes[i]!;
      const result = results[i]!;

      if (result.status === "fulfilled") {
        const pr = result.value;
        probeResults.push(pr);

        if (pr.reachable) {
          // Apply EWMA smoothing to the stored latency.
          const prev = node.latencyMs;
          const next  = EWMA_ALPHA * pr.latencyMs + (1 - EWMA_ALPHA) * prev;
          node.latencyMs = Math.round(next);
          this.registry.update(node);
        }

        if (!regionLatencies.has(node.region)) regionLatencies.set(node.region, []);
        if (pr.reachable) regionLatencies.get(node.region)!.push(pr.latencyMs);
      }
    }

    // Update region index averages.
    for (const [regionId, latencies] of regionLatencies) {
      if (latencies.length === 0) continue;
      const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
      this.regionIndex.updateLatency(regionId, Math.round(avg));
    }

    return probeResults;
  }

  /**
   * Probe a single node by timing an HTTP HEAD to its health endpoint.
   * Returns a LatencyProbeResult.  Never throws.
   */
  async probe(nodeId: string, host: string, port: number): Promise<LatencyProbeResult> {
    const probedAt = Date.now();

    if (!SAFE_HOST_RE.test(host)) {
      return { nodeId, host, port, latencyMs: 0, reachable: false, probedAt };
    }

    const url = `http://${host}:${port}/healthz`;
    const ctl  = new AbortController();
    const tid  = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
    const t0   = Date.now();

    try {
      const res = await fetch(url, { method: "HEAD", signal: ctl.signal });
      clearTimeout(tid);
      return {
        nodeId,
        host,
        port,
        latencyMs: Date.now() - t0,
        reachable: res.ok,
        probedAt,
      };
    } catch {
      clearTimeout(tid);
      return { nodeId, host, port, latencyMs: PROBE_TIMEOUT_MS, reachable: false, probedAt };
    }
  }
}
