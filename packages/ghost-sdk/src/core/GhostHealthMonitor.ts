/**
 * GhostHealthMonitor
 *
 * Aggregated health status for the entire GhostStack (L1 + L2 + L3).
 *
 * Combines:
 *   - RPC endpoint health (GhostRPCMonitor)
 *   - Validator node health (GhostValidatorMonitor)
 *   - Per-layer block production rate
 *
 * Emits a summary `StackHealthReport` suitable for dashboards,
 * alerting, or autonomous self-healing logic.
 *
 * Usage:
 *   const monitor = new GhostHealthMonitor();
 *   const report  = await monitor.check();
 *   if (!report.healthy) console.warn("Stack degraded:", report.issues);
 *
 *   // Continuous monitoring:
 *   monitor.start((report) => dashboard.update(report));
 *   monitor.stop();
 */

import { GhostRPCMonitor, RpcHealthResult } from "../validator/GhostRPCMonitor.js";
import { GhostValidatorMonitor, ValidatorHealth, ValidatorMonitorConfig } from "../validator/GhostValidatorMonitor.js";
import { GhostNetworks } from "../networks.js";
import type { GhostLayer } from "../networks.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LayerHealth {
  layer:        GhostLayer;
  rpc:          RpcHealthResult;
  validator:    ValidatorHealth;
  healthy:      boolean;
  issues:       string[];
}

// Suppress unused-import lint for imported type
type _ValidatorMonitorConfig = ValidatorMonitorConfig;

export interface StackHealthReport {
  timestamp: number;
  healthy:   boolean;
  layers:    Record<GhostLayer, LayerHealth>;
  issues:    string[];
  summary:   "green" | "yellow" | "red";
}

export interface GhostHealthMonitorConfig {
  /** How often to run checks in ms. Default: 15000 */
  intervalMs?: number;
  /** Custom RPC URLs per layer */
  rpcOverrides?: Partial<Record<GhostLayer, string>>;
}

// ── GhostHealthMonitor ─────────────────────────────────────────────────────────

export class GhostHealthMonitor {
  private readonly intervalMs: number;
  private readonly overrides:  Partial<Record<GhostLayer, string>>;
  private readonly rpcMon:     GhostRPCMonitor;
  private readonly valMon:     GhostValidatorMonitor;

  private _timer:    ReturnType<typeof setInterval> | null = null;
  private _lastReport: StackHealthReport | null = null;

  constructor(config: GhostHealthMonitorConfig = {}) {
    this.intervalMs = config.intervalMs ?? 15_000;
    this.overrides  = config.rpcOverrides ?? {};
    this.rpcMon     = new GhostRPCMonitor();
    this.valMon     = new GhostValidatorMonitor();
  }

  // ── One-shot check ─────────────────────────────────────────────────────────

  async check(): Promise<StackHealthReport> {
    const LAYERS: GhostLayer[] = ["L1", "L2", "L3"];
    const checks = await Promise.allSettled(
      LAYERS.map(async (layer) => {
        const rpcUrl = this.overrides[layer] ?? GhostNetworks[layer].rpc;
        const [rpc, validator] = await Promise.allSettled([
          this.rpcMon.check(rpcUrl),
          this.valMon.checkValidator(rpcUrl, layer),
        ]);

        const rpcResult  = rpc.status === "fulfilled"       ? rpc.value       : _deadRpc(rpcUrl);
        const valResult  = validator.status === "fulfilled"  ? validator.value : _deadValidator(layer);

        const issues: string[] = [];
        if (!rpcResult.available)   issues.push(`${layer}: RPC unreachable`);
        if (rpcResult.latencyMs > 2_000) issues.push(`${layer}: RPC high latency (${rpcResult.latencyMs}ms)`);
        if (valResult.syncing)      issues.push(`${layer}: validator is syncing`);
        if ((valResult.peers ?? 1) < 1)  issues.push(`${layer}: validator has no peers`);
        if (!valResult.healthy)     issues.push(`${layer}: validator error — ${valResult.error ?? "unknown"}`);

        const healthy = issues.length === 0;
        return { layer, rpc: rpcResult, validator: valResult, healthy, issues } satisfies LayerHealth;
      }),
    );

    const layers = {} as Record<GhostLayer, LayerHealth>;
    const allIssues: string[] = [];

    for (const result of checks) {
      if (result.status === "fulfilled") {
        layers[result.value.layer] = result.value;
        allIssues.push(...result.value.issues);
      }
    }

    const healthyCount = Object.values(layers).filter((l) => l.healthy).length;
    const summary: StackHealthReport["summary"] =
      healthyCount === 3 ? "green" : healthyCount === 0 ? "red" : "yellow";

    const report: StackHealthReport = {
      timestamp: Date.now(),
      healthy:   healthyCount === 3,
      layers,
      issues:    allIssues,
      summary,
    };

    this._lastReport = report;
    return report;
  }

  // ── Continuous monitoring ──────────────────────────────────────────────────

  /** Start recurring health checks. Callback is invoked with each report. */
  start(onReport?: (report: StackHealthReport) => void): void {
    if (this._timer) return;
    const run = async () => {
      const report = await this.check();
      onReport?.(report);
    };
    void run();
    this._timer = setInterval(() => void run(), this.intervalMs);
  }

  /** Stop recurring checks. */
  stop(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /** Return the most recent report without triggering a new check. */
  get lastReport(): StackHealthReport | null { return this._lastReport; }
}

// ── Fallback constructors ─────────────────────────────────────────────────────

function _deadRpc(rpcUrl: string): RpcHealthResult {
  return { url: rpcUrl, available: false, latencyMs: 0, blockNumber: null, blockLag: null, checkedAt: Date.now() };
}

function _deadValidator(layer: GhostLayer): ValidatorHealth {
  return {
    layer,
    rpcUrl:    GhostNetworks[layer].rpc,
    block:     null,
    peers:     null,
    syncing:   null,
    healthy:   false,
    error:     "check failed",
    checkedAt: Date.now(),
  };
}
