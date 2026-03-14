/**
 * GhostBrain Decision Engine
 *
 * Converts infrastructure metrics into a prioritised list of decisions.
 * Augments local rule-based logic with GhostBrain /v1/classify risk scoring.
 *
 * Security: read-only toward GhostBrain — never writes on-chain autonomously.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecisionKind =
  | "noop"
  | "restart_container"
  | "restart_vm"
  | "rebuild_container"
  | "scale_up"
  | "rebalance"
  | "governance_alert"
  | "network_alert";

export interface Decision {
  kind: DecisionKind;
  /** Target resource name (container name, VM name, etc.). */
  target?: string;
  reason: string;
  /** Higher = execute first. */
  priority: number;
  /** Unix ms timestamp of decision creation. */
  timestamp: number;
}

export interface MetricsSnapshot {
  /** System CPU load 0–100 percent. */
  cpuLoad: number;
  /** System memory used 0–100 percent. */
  memoryUsedPct: number;
  /** Container names reporting (unhealthy) status. */
  unhealthyContainers: string[];
  /** Container names reporting (exited) or removed status. */
  exitedContainers: string[];
  /** VM names that are shut off. */
  offlineVMs: string[];
  /** Current L2 block lag (distance from L1-submitted block). */
  l2BlockLag: number;
  /** Network interfaces with high error rates. */
  degradedInterfaces: string[];
  /** 0–1 risk score seeded from previous GhostBrain call; updated in-place below. */
  riskScore: number;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const CPU_SCALE_THRESHOLD    = Number(process.env["CPU_SCALE_THRESHOLD"]    ?? "85");
const MEM_ALERT_THRESHOLD    = Number(process.env["MEM_ALERT_THRESHOLD"]    ?? "90");
const L2_LAG_ALERT_THRESHOLD = Number(process.env["L2_LAG_ALERT_THRESHOLD"] ?? "500");
const RISK_ALERT_THRESHOLD   = Number(process.env["RISK_ALERT_THRESHOLD"]   ?? "0.7");

const GHOSTBRAIN_API_URL =
  process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";

// ---------------------------------------------------------------------------
// DecisionEngine
// ---------------------------------------------------------------------------

export class DecisionEngine {
  /**
   * Produce a prioritised decision list for the given MetricsSnapshot.
   * Calls GhostBrain /v1/classify for risk augmentation; falls back to
   * local rules if GhostBrain is unavailable.
   */
  async decide(metrics: MetricsSnapshot): Promise<Decision[]> {
    const now = Date.now();
    const decisions: Decision[] = [];

    // 1. Risk augmentation — call GhostBrain's classification endpoint.
    let riskScore = metrics.riskScore;
    try {
      const res = await fetch(`${GHOSTBRAIN_API_URL}/v1/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3_000),
        body: JSON.stringify({
          context: "infrastructure-supervisor",
          data: {
            cpu_load:                   metrics.cpuLoad,
            memory_used_pct:            metrics.memoryUsedPct,
            unhealthy_container_count:  metrics.unhealthyContainers.length,
            exited_container_count:     metrics.exitedContainers.length,
            offline_vm_count:           metrics.offlineVMs.length,
            l2_block_lag:               metrics.l2BlockLag,
            degraded_interface_count:   metrics.degradedInterfaces.length,
          },
        }),
      });
      if (res.ok) {
        const body = await res.json() as { risk_score?: number };
        if (typeof body.risk_score === "number") riskScore = body.risk_score;
      }
    } catch {
      // GhostBrain unreachable — local rules only.
    }

    // 2. Local rule set (in priority order).

    // 2a. Offline VMs — highest urgency (chain validators may be down).
    for (const vm of metrics.offlineVMs) {
      decisions.push({
        kind: "restart_vm",
        target: vm,
        reason: `VM "${vm}" is offline`,
        priority: 95,
        timestamp: now,
      });
    }

    // 2b. Unhealthy containers.
    for (const container of metrics.unhealthyContainers) {
      decisions.push({
        kind: "restart_container",
        target: container,
        reason: `Container "${container}" reported unhealthy`,
        priority: 80,
        timestamp: now,
      });
    }

    // 2c. Exited containers (unexpected exit → rebuild).
    for (const container of metrics.exitedContainers) {
      decisions.push({
        kind: "rebuild_container",
        target: container,
        reason: `Container "${container}" exited unexpectedly`,
        priority: 75,
        timestamp: now,
      });
    }

    // 2d. High risk score → propose governance alert (human-ratified).
    if (riskScore >= RISK_ALERT_THRESHOLD) {
      decisions.push({
        kind: "governance_alert",
        reason: `Risk score ${riskScore.toFixed(3)} ≥ threshold ${RISK_ALERT_THRESHOLD}`,
        priority: 70,
        timestamp: now,
      });
    }

    // 2e. CPU overload → scale signal.
    if (metrics.cpuLoad >= CPU_SCALE_THRESHOLD) {
      decisions.push({
        kind: "scale_up",
        reason: `CPU load ${metrics.cpuLoad.toFixed(1)}% ≥ threshold ${CPU_SCALE_THRESHOLD}%`,
        priority: 60,
        timestamp: now,
      });
    }

    // 2f. Memory pressure → scale signal (different priority to distinguish).
    if (metrics.memoryUsedPct >= MEM_ALERT_THRESHOLD) {
      decisions.push({
        kind: "scale_up",
        reason: `Memory used ${metrics.memoryUsedPct.toFixed(1)}% ≥ threshold ${MEM_ALERT_THRESHOLD}%`,
        priority: 55,
        timestamp: now,
      });
    }

    // 2g. L2 block lag.
    if (metrics.l2BlockLag >= L2_LAG_ALERT_THRESHOLD) {
      decisions.push({
        kind: "governance_alert",
        reason: `L2 block lag ${metrics.l2BlockLag} ≥ threshold ${L2_LAG_ALERT_THRESHOLD}`,
        priority: 65,
        timestamp: now,
      });
    }

    // 2h. Network interface degradation.
    for (const iface of metrics.degradedInterfaces) {
      decisions.push({
        kind: "network_alert",
        target: iface,
        reason: `Interface "${iface}" has elevated error rate`,
        priority: 50,
        timestamp: now,
      });
    }

    // Sort descending by priority; stable (preserve insertion order on tie).
    decisions.sort((a, b) => b.priority - a.priority);

    return decisions.length > 0
      ? decisions
      : [{ kind: "noop", reason: "all metrics nominal", priority: 0, timestamp: now }];
  }
}
