/**
 * @file GhostNodeHealth.ts
 * @module @ghostchain/ghost-nodes
 *
 * GhostNodeHealth — background health monitor for the Ghost fleet.
 *
 * Polls GhostNode instances on a configurable interval,
 * tracks consecutive failures, emits alerts on status transitions.
 */

import { GhostNode } from "./GhostNode.js";
import { GhostNodeStatus } from "./types.js";

// ─── Alert types ──────────────────────────────────────────────────────────────

export type GhostHealthAlertSeverity = "critical" | "warning" | "info";

export interface GhostHealthAlert {
  nodeEndpoint:  string;
  nodeName:      string;
  severity:      GhostHealthAlertSeverity;
  previousStatus: GhostNodeStatus;
  currentStatus:  GhostNodeStatus;
  consecutiveFailures: number;
  latencyMs?:    number;
  timestamp:     Date;
  message:       string;
}

export type GhostHealthAlertHandler = (alert: GhostHealthAlert) => void | Promise<void>;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface GhostNodeHealthConfig {
  intervalMs:          number;  // default 30_000
  criticalThreshold:   number;  // failures before critical alert (default 3)
  warningThreshold:    number;  // failures before warning alert (default 1)
  alertHandlers:       GhostHealthAlertHandler[];
}

// ─── GhostNodeHealthMonitor ───────────────────────────────────────────────────

/**
 * Background health monitor for Ghost fleet nodes.
 *
 * Usage:
 * ```ts
 * const monitor = new GhostNodeHealthMonitor(nodes, {
 *   intervalMs:        15_000,
 *   criticalThreshold: 3,
 *   warningThreshold:  1,
 *   alertHandlers:     [(alert) => console.error(alert)],
 * });
 * monitor.start();
 * ```
 */
export class GhostNodeHealthMonitor {
  private readonly _nodes:   GhostNode[];
  private readonly _config:  GhostNodeHealthConfig;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private readonly _previousStatus = new Map<string, GhostNodeStatus>();
  private readonly _consecutiveFailures = new Map<string, number>();

  constructor(nodes: GhostNode[], config: Partial<GhostNodeHealthConfig> = {}) {
    this._nodes  = [...nodes];
    this._config = {
      intervalMs:        config.intervalMs        ?? 30_000,
      criticalThreshold: config.criticalThreshold ?? 3,
      warningThreshold:  config.warningThreshold  ?? 1,
      alertHandlers:     config.alertHandlers     ?? [],
    };
    for (const node of this._nodes) {
      this._previousStatus.set(node.rpcUrl, GhostNodeStatus.Unknown);
      this._consecutiveFailures.set(node.rpcUrl, 0);
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Start background health polling. */
  start(): void {
    if (this._timer) return;
    this._pollAll(); // Run immediately
    this._timer = setInterval(() => this._pollAll(), this._config.intervalMs);
  }

  /** Stop background health polling. */
  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** True if the monitor is actively polling. */
  get isRunning(): boolean {
    return this._timer !== null;
  }

  // ─── Status access ────────────────────────────────────────────────────────

  /** Returns current health snapshot for all monitored nodes. */
  snapshot(): Array<{
    node:    GhostNode;
    status:  GhostNodeStatus;
    latencyMs?: number;
    failures: number;
  }> {
    return this._nodes.map((n) => ({
      node:     n,
      status:   n.health.status,
      latencyMs: n.health.latencyMs,
      failures: this._consecutiveFailures.get(n.rpcUrl) ?? 0,
    }));
  }

  /** Returns only unreachable nodes. */
  downNodes(): GhostNode[] {
    return this._nodes.filter((n) => n.health.status === GhostNodeStatus.Unreachable);
  }

  /** Returns only healthy nodes. */
  healthyNodes(): GhostNode[] {
    return this._nodes.filter((n) => n.health.status === GhostNodeStatus.Healthy);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private _pollAll(): void {
    for (const node of this._nodes) {
      this._pollNode(node).catch(() => {});
    }
  }

  private async _pollNode(node: GhostNode): Promise<void> {
    const prevStatus  = this._previousStatus.get(node.rpcUrl) ?? GhostNodeStatus.Unknown;
    let currStatus: GhostNodeStatus;
    let latencyMs: number | undefined;

    try {
      const snap = await node.checkHealth();
      currStatus = snap.status;
      latencyMs  = snap.latencyMs;
    } catch {
      currStatus = GhostNodeStatus.Unreachable;
    }

    const prevFailures = this._consecutiveFailures.get(node.rpcUrl) ?? 0;
    let consecutiveFailures: number;

    if (currStatus === GhostNodeStatus.Unreachable || currStatus === GhostNodeStatus.Degraded) {
      consecutiveFailures = prevFailures + 1;
    } else {
      consecutiveFailures = 0;
    }

    this._consecutiveFailures.set(node.rpcUrl, consecutiveFailures);
    this._previousStatus.set(node.rpcUrl, currStatus);

    // Emit alert on status change or threshold crossing
    if (prevStatus !== currStatus || this._shouldAlert(consecutiveFailures)) {
      await this._emitAlert({
        nodeEndpoint:        node.rpcUrl,
        nodeName:            node.config.name,
        severity:            this._severity(currStatus, consecutiveFailures),
        previousStatus:      prevStatus,
        currentStatus:       currStatus,
        consecutiveFailures,
        latencyMs,
        timestamp:           new Date(),
        message:             this._alertMessage(node.config.name, currStatus, consecutiveFailures),
      });
    }
  }

  private _shouldAlert(failures: number): boolean {
    return (
      failures === this._config.warningThreshold ||
      failures === this._config.criticalThreshold
    );
  }

  private _severity(status: GhostNodeStatus, failures: number): GhostHealthAlertSeverity {
    if (status === GhostNodeStatus.Healthy)   return "info";
    if (failures >= this._config.criticalThreshold) return "critical";
    return "warning";
  }

  private _alertMessage(name: string, status: GhostNodeStatus, failures: number): string {
    if (status === GhostNodeStatus.Healthy)     return `Ghost node "${name}" is healthy`;
    if (status === GhostNodeStatus.Degraded)    return `Ghost node "${name}" is degraded (${failures} failures)`;
    if (status === GhostNodeStatus.Unreachable) return `Ghost node "${name}" UNREACHABLE (${failures} consecutive failures)`;
    return `Ghost node "${name}" status: ${status}`;
  }

  private async _emitAlert(alert: GhostHealthAlert): Promise<void> {
    for (const handler of this._config.alertHandlers) {
      try {
        await handler(alert);
      } catch {
        // Swallow handler errors — don't let them affect the monitor loop
      }
    }
  }
}
