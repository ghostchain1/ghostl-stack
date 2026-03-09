/**
 * GhostBrain Core — Decision Engine
 *
 * Queries memory layers to produce autonomous infrastructure decisions:
 * - predict failures before they happen
 * - recommend the best known fix
 * - decide optimal container/VM configuration
 * - flag threshold breaches and recommend rebalancing
 *
 * All decisions include a confidence score and rationale.
 * Human governance ratification is required for destructive actions.
 */

import { queryKnowledge }    from "../memory/cognitive_memory.js";
import { getInfraHistory, THRESHOLDS } from "../memory/infrastructure_memory.js";
import { lookupFix, getAllFixes } from "../memory/fix_memory.js";
import { bestConfig }        from "../memory/performance_memory.js";
import { search }            from "../memory/vector_memory.js";

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type ActionCategory =
  | "scale_memory"
  | "scale_cpu"
  | "restart"
  | "reroute"
  | "throttle"
  | "alert"
  | "none";

export interface Decision {
  resourceId:       string;
  riskLevel:        RiskLevel;
  predictedFailure: boolean;
  confidence:       number;       // 0–1
  action:           ActionCategory;
  actionParams:     Record<string, unknown>;
  rationale:        string[];
  requiresGovernance: boolean;    // destructive actions need ratification
  decidedAt:        string;
}

/** Compute a risk level from current infra stats. */
function riskFromStats(avgCpu: number, avgMem: number, critEvents: number): RiskLevel {
  if (avgCpu >= THRESHOLDS.CPU_CRIT || avgMem >= THRESHOLDS.MEM_CRIT || critEvents > 5) return "critical";
  if (avgCpu >= THRESHOLDS.CPU_WARN || avgMem >= THRESHOLDS.MEM_WARN || critEvents > 1) return "high";
  if (avgCpu >= 70 || avgMem >= 65) return "medium";
  if (avgCpu >= 50 || avgMem >= 50) return "low";
  return "none";
}

/**
 * Core decision function — analyse memory state for a resource and
 * produce an autonomous action recommendation.
 */
export function decide(resourceId: string, layer = "container"): Decision {
  const now = Date.now();
  const rationale: string[] = [];
  let confidence = 0.5;

  // --- Infrastructure memory analysis (last 30 min) ---
  const history = getInfraHistory(resourceId, undefined, 1_800_000);
  const critEvents = history.filter(s => s.severity === "critical").length;

  const avgCpu = history.length
    ? history.reduce((s, h) => s + h.cpuPct, 0) / history.length
    : 0;
  const avgMem = history.length
    ? history.reduce((s, h) => s + h.memPct, 0) / history.length
    : 0;
  const restartsRecent = history.reduce((s, h) => Math.max(s, h.restarts), 0);

  const riskLevel = riskFromStats(avgCpu, avgMem, critEvents);

  // --- Crash knowledge ---
  const crashPatterns = queryKnowledge("crash").filter(k =>
    k.key.includes(resourceId) || k.key.includes(layer),
  );
  if (crashPatterns.length > 0) {
    rationale.push(`Known crash patterns: ${crashPatterns.map(k => k.key).join(", ")}`);
    confidence += 0.15;
  }

  // --- Fix recall ---
  const knownFix = lookupFix(resourceId) ?? lookupFix(`crash:${layer}:${resourceId}`);
  if (knownFix) {
    rationale.push(`Known fix available: "${knownFix.solution}" (${(knownFix.successRate * 100).toFixed(0)}% success rate)`);
    confidence += knownFix.successRate * 0.2;
  }

  // --- Performance history ---
  const optCpu = bestConfig(resourceId, "cpu_limit");
  const optMem = bestConfig(resourceId, "memory_limit");
  if (optCpu) rationale.push(`Optimal CPU config history found: ${JSON.stringify(optCpu)}`);
  if (optMem) rationale.push(`Optimal memory config history found: ${JSON.stringify(optMem)}`);

  // --- Vector similarity (related incidents) ---
  const similar = search(`${layer} ${resourceId} crash`, 3, 0.4);
  if (similar.length > 0) {
    rationale.push(`${similar.length} similar incident(s) found in vector memory`);
    confidence += 0.1;
  }

  // --- Failure prediction ---
  const predictedFailure = riskLevel === "critical" || riskLevel === "high" && restartsRecent > 2;

  if (predictedFailure) rationale.push(`Failure predicted: ${riskLevel} risk, ${restartsRecent} restarts, cpu=${avgCpu.toFixed(0)}% mem=${avgMem.toFixed(0)}%`);

  // --- Action selection ---
  let action: ActionCategory = "none";
  const actionParams: Record<string, unknown> = {};

  if (riskLevel === "critical" || predictedFailure) {
    if (avgMem >= THRESHOLDS.MEM_CRIT) {
      action = "scale_memory";
      actionParams["addMb"] = 512;
      actionParams["resourceId"] = resourceId;
    } else if (avgCpu >= THRESHOLDS.CPU_CRIT) {
      action = "scale_cpu";
      actionParams["addCores"] = 1;
      actionParams["resourceId"] = resourceId;
    } else {
      action = "restart";
      actionParams["resourceId"] = resourceId;
    }
    rationale.push(`Recommended action: ${action}`);
  } else if (riskLevel === "high") {
    action = "alert";
    actionParams["level"] = "high";
    actionParams["resourceId"] = resourceId;
  }

  // Override with known fix if confidence is high
  if (knownFix && knownFix.successRate >= 0.8 && predictedFailure) {
    action = knownFix.actionType as ActionCategory;
    actionParams["solution"] = knownFix.solution;
    rationale.push(`Using proven fix (${knownFix.actionType}) with ${(knownFix.successRate * 100).toFixed(0)}% success rate`);
    confidence = Math.min(0.95, confidence + 0.15);
  }

  const requiresGovernance = action === "restart" || action === "scale_memory" || action === "scale_cpu";

  return {
    resourceId,
    riskLevel,
    predictedFailure,
    confidence:    Math.min(0.99, confidence),
    action,
    actionParams,
    rationale,
    requiresGovernance,
    decidedAt:     new Date(now).toISOString(),
  };
}

/**
 * Scan all resources seen in the last hour and return all non-trivial decisions.
 */
export function scanAll(): Decision[] {
  // Collect unique resource IDs from fix memory as proxy for all known resources
  const resourceIds = new Set<string>(
    getAllFixes().map(f => f.id).concat(
      queryKnowledge().map(k => k.key),
    ),
  );
  return [...resourceIds]
    .map(id => decide(id))
    .filter(d => d.riskLevel !== "none");
}
