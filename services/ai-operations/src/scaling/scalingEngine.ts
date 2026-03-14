// ── AI Scaling Engine ─────────────────────────────────────────────────────────
// Evaluates system metrics and triggers horizontal scaling via the Repair Engine.
// Implements a cooldown period to prevent scale thrashing.
// Scale-in is recommendation-only (never auto-deprovisions nodes).

import { SystemMetrics } from "../monitoring/metricsCollector";
import { deployNewNode } from "../repair/repairEngine";

export type ScalingAction = "scale_out" | "scale_in" | "rebalance" | "none";

export interface ScalingEvent {
  id:        string;
  action:    ScalingAction;
  reason:    string;
  nodeType:  string;
  triggered: boolean; // true = action was actually executed
  timestamp: number;
}

let scalingHistory: ScalingEvent[] = [];
let scaleCounter  = 0;
let lastScaleTime = 0;

const SCALE_COOLDOWN_MS = 5 * 60 * 1_000; // 5-minute cooldown between scale events

function record(event: ScalingEvent): ScalingEvent {
  scalingHistory.push(event);
  if (scalingHistory.length > 100) scalingHistory = scalingHistory.slice(-100);
  console.log(`[ScalingEngine] ${event.id} ${event.action} (${event.nodeType}): ${event.reason}`);
  return event;
}

export async function scaleInfrastructure(metrics: SystemMetrics): Promise<ScalingEvent> {
  const now        = Date.now();
  const id         = `SCALE-${String(++scaleCounter).padStart(4, "0")}`;
  const cooledDown = now - lastScaleTime > SCALE_COOLDOWN_MS;

  // Scale out: high CPU pressure
  if (metrics.avgCpu > 80 && cooledDown) {
    lastScaleTime = now;
    const result  = await deployNewNode("rpc");
    return record({
      id,
      action:    "scale_out",
      nodeType:  "rpc",
      reason:    `Avg CPU ${metrics.avgCpu.toFixed(0)}% — deploying additional RPC node`,
      triggered: result.status === "success",
      timestamp: now,
    });
  }

  // Scale out: validator pressure from offline nodes
  if (metrics.offlineNodes >= 2 && cooledDown) {
    lastScaleTime = now;
    const result  = await deployNewNode("validator");
    return record({
      id,
      action:    "scale_out",
      nodeType:  "validator",
      reason:    `${metrics.offlineNodes} validators offline — deploying replacement`,
      triggered: result.status === "success",
      timestamp: now,
    });
  }

  // Scale-in recommendation (never auto-executed)
  if (metrics.avgCpu < 20 && metrics.onlineNodes > 8 && cooledDown) {
    return record({
      id,
      action:    "scale_in",
      nodeType:  "rpc",
      reason:    `Low utilization (avg CPU ${metrics.avgCpu.toFixed(0)}%) — consolidation recommended`,
      triggered: false,
      timestamp: now,
    });
  }

  return record({
    id,
    action:    "none",
    nodeType:  "—",
    reason:    `Nominal — cpu=${metrics.avgCpu.toFixed(0)}%, nodes=${metrics.onlineNodes}/${metrics.totalNodes}`,
    triggered: false,
    timestamp: now,
  });
}

export function getScalingHistory(): ScalingEvent[]      { return scalingHistory; }
export function getLatestScalingEvent(): ScalingEvent | null {
  return scalingHistory[scalingHistory.length - 1] ?? null;
}
