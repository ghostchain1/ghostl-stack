/**
 * GhostBrain Global Orchestrator — Region Manager
 *
 * Responsible for a single geographic cluster.  On each check() call it:
 *  1. Probes every registered node via HTTP health endpoint (execFile-free,
 *     pure fetch() with AbortController).
 *  2. Updates node status in the NodeRegistry.
 *  3. Returns a CheckSummary for the GlobalController to aggregate.
 *
 * The RegionManager does NOT take autonomous remediation actions — it surfaces
 * findings which the FailoverManager and AutoScaler act upon.
 *
 * SECURITY: All URLs are built from validated host strings; no user input is
 * interpolated into URLs.
 */

import type {
  GhostNode,
  NodeStatus,
  RegionInfo,
  ScalingRecommendation,
} from "../types.js";
import type { NodeRegistry } from "../discovery/node_registry.js";
import type { AutoScaler }   from "../scaling/autoscaler.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HEALTH_TIMEOUT_MS = parseInt(
  process.env["ORCHESTRATOR_HEALTH_TIMEOUT_MS"] ?? "3000", 10,
);

/** If a node hasn't responded for this long it becomes "offline". */
const OFFLINE_THRESHOLD_MS = parseInt(
  process.env["ORCHESTRATOR_OFFLINE_THRESHOLD_MS"] ?? "30000", 10,
);

/** Hostname/IP allowlist regex — prevents SSRF via crafted node registrations. */
const SAFE_HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckSummary {
  regionId:              string;
  totalNodes:            number;
  healthyCount:          number;
  unhealthyCount:        number;
  degradedCount:         number;
  offlineCount:          number;
  scalingRecommendation: ScalingRecommendation | null;
  checkedAt:             number;
}

// ---------------------------------------------------------------------------
// RegionManager
// ---------------------------------------------------------------------------

export class RegionManager {
  private readonly nodes: GhostNode[] = [];
  private lastCheckedAt               = 0;

  constructor(
    readonly regionId: string,
    readonly regionName: string,
    private readonly registry: NodeRegistry,
    private readonly scaler: AutoScaler,
  ) {}

  /** Add a node to this region. */
  addNode(node: GhostNode): void {
    if (node.region !== this.regionId) {
      throw new Error(
        `node ${node.id} belongs to region ${node.region}, not ${this.regionId}`,
      );
    }
    this.nodes.push(node);
    this.registry.register(node);
  }

  /**
   * Probe all nodes in parallel, update their statuses in the registry,
   * and return a summary.
   */
  async check(): Promise<CheckSummary> {
    const now = Date.now();

    const probeResults = await Promise.allSettled(
      this.nodes.map(node => this.probeNode(node, now)),
    );

    // Update registry with fresh statuses.
    for (let i = 0; i < this.nodes.length; i++) {
      const result = probeResults[i];
      const node   = this.nodes[i];
      if (!node) continue;

      if (result.status === "fulfilled") {
        const { status, latencyMs } = result.value;
        node.status    = status;
        node.latencyMs = latencyMs;
        node.lastSeenAt = status !== "offline" ? now : node.lastSeenAt;
      } else {
        node.status    = "offline";
      }
      this.registry.update(node);
    }

    const healthy   = this.nodes.filter(n => n.status === "healthy").length;
    const degraded  = this.nodes.filter(n => n.status === "degraded").length;
    const offline   = this.nodes.filter(n => n.status === "offline").length;
    const unhealthy = degraded + offline;

    const scaling = this.scaler.evaluate(this.nodes, this.regionId);

    this.lastCheckedAt = now;

    return {
      regionId:              this.regionId,
      totalNodes:            this.nodes.length,
      healthyCount:          healthy,
      unhealthyCount:        unhealthy,
      degradedCount:         degraded,
      offlineCount:          offline,
      scalingRecommendation: scaling.action !== "none" ? scaling : null,
      checkedAt:             now,
    };
  }

  /** Region metadata snapshot for GlobalController diagnostics. */
  getInfo(): RegionInfo {
    const now     = Date.now();
    const healthy = this.nodes.filter(n => n.status === "healthy").length;
    const avgLat  = this.nodes.length
      ? this.nodes.reduce((s, n) => s + n.latencyMs, 0) / this.nodes.length
      : 0;

    const l1 = this.nodes.find(n => n.role === "l1");
    const l2 = this.nodes.find(n => n.role === "l2");
    const l3 = this.nodes.find(n => n.role === "l3");

    return {
      id:             this.regionId,
      name:           this.regionName,
      primaryL1Host:  l1?.host ?? "",
      primaryL2Host:  l2?.host ?? "",
      primaryL3Host:  l3?.host ?? "",
      avgLatencyMs:   Math.round(avgLat),
      nodeCount:      this.nodes.length,
      healthyCount:   healthy,
      lastCheckedAt:  this.lastCheckedAt || now,
    };
  }

  get nodeCount(): number { return this.nodes.length; }

  // -------------------------------------------------------------------------
  // Internal probe
  // -------------------------------------------------------------------------

  private async probeNode(
    node: GhostNode,
    now:  number,
  ): Promise<{ status: NodeStatus; latencyMs: number }> {
    // Guard against SSRF via crafted hostnames.
    if (!SAFE_HOST_RE.test(node.host)) {
      return { status: "offline", latencyMs: 0 };
    }

    // Determine which endpoint to probe based on role.
    const port = node.adminPort ?? (node.rpcPort + 1);
    const url  = `http://${node.host}:${port}/healthz`;

    const ctl      = new AbortController();
    const tid      = setTimeout(() => ctl.abort(), HEALTH_TIMEOUT_MS);
    const probeStart = Date.now();

    try {
      const res = await fetch(url, { signal: ctl.signal });
      clearTimeout(tid);
      const latencyMs = Date.now() - probeStart;

      if (res.ok) {
        // Parse load if the health endpoint returns it.
        const body = await res.json().catch(() => null) as Record<string, unknown> | null;
        if (body && typeof body["load_pct"] === "number") {
          node.loadPct = body["load_pct"] as number;
        }
        const status: NodeStatus = node.loadPct > 85 ? "degraded" : "healthy";
        return { status, latencyMs };
      } else {
        return { status: "degraded", latencyMs: Date.now() - probeStart };
      }
    } catch {
      clearTimeout(tid);
      // Node hasn't been seen for a while → offline; otherwise degraded.
      const staleMs = now - node.lastSeenAt;
      const status: NodeStatus = staleMs > OFFLINE_THRESHOLD_MS ? "offline" : "degraded";
      return { status, latencyMs: HEALTH_TIMEOUT_MS };
    }
  }
}
