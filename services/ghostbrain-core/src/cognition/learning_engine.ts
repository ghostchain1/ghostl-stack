/**
 * GhostBrain Core — Learning Engine
 *
 * Processes incoming signals/events and extracts learnable patterns:
 * - crash events → CognitiveMemory (crash category) + FixMemory
 * - performance events → PerformanceMemory
 * - infra snapshots → InfrastructureMemory + threshold alerts
 * - successful AI actions → FixMemory (positive reinforcement)
 *
 * Called from the signals route after each BrainMessage is received.
 */

import { storeKnowledge }    from "../memory/cognitive_memory.js";
import { recordInfraSnapshot, THRESHOLDS } from "../memory/infrastructure_memory.js";
import { recordFixResult }   from "../memory/fix_memory.js";
import { recordOptimization } from "../memory/performance_memory.js";
import { storeVector }       from "../memory/vector_memory.js";
import type { InfraLayer }   from "../memory/infrastructure_memory.js";

export type LearnEvent =
  | { type: "crash";        resourceId: string; reason: string; layer: InfraLayer; meta?: Record<string, unknown> }
  | { type: "fix_result";   problem: string; solution: string; actionType: string; params: Record<string, unknown>; success: boolean; recoveryMs: number }
  | { type: "infra_snap";   resourceId: string; layer: InfraLayer; cpuPct: number; memPct: number; diskIoPct?: number; netMbps?: number; restarts?: number; healthy?: boolean; meta?: Record<string, unknown> }
  | { type: "optimization"; resourceId: string; optType: import("../memory/performance_memory.js").OptimizationType; before: Record<string, number>; after: Record<string, number>; improvement: number; note?: string }
  | { type: "attack";       signature: string; source?: string; targetService?: string; meta?: Record<string, unknown> };

export interface LearningResult {
  event:    string;
  learned:  boolean;
  severity?: string;
  note?:    string;
}

/** Process a single learn event — idempotent, never throws. */
export function learn(event: LearnEvent): LearningResult {
  try {
    switch (event.type) {

      case "crash": {
        const key = `crash:${event.layer}:${event.resourceId}`;
        storeKnowledge("crash", key,
          `${event.layer} resource ${event.resourceId} crashed: ${event.reason}`,
          { resourceId: event.resourceId, layer: event.layer, reason: event.reason, ...event.meta },
        );
        storeVector(key, `crash ${event.layer} ${event.resourceId} ${event.reason}`, { type: "crash", ...event.meta });
        return { event: event.type, learned: true, note: key };
      }

      case "fix_result": {
        const rec = recordFixResult(
          event.problem, event.solution, event.actionType,
          event.params, event.success, event.recoveryMs,
        );
        storeKnowledge("crash", `fix:${rec.id}`,
          `Fix "${event.solution}" for "${event.problem}" — success rate ${(rec.successRate * 100).toFixed(1)}%`,
          { ...rec },
          rec.successRate,
        );
        return { event: event.type, learned: true, note: `successRate=${rec.successRate}` };
      }

      case "infra_snap": {
        const severity = recordInfraSnapshot({
          ts:         Date.now(),
          layer:      event.layer,
          resourceId: event.resourceId,
          cpuPct:     event.cpuPct,
          memPct:     event.memPct,
          diskIoPct:  event.diskIoPct ?? 0,
          netMbps:    event.netMbps   ?? 0,
          restarts:   event.restarts  ?? 0,
          healthy:    event.healthy   ?? true,
          meta:       event.meta      ?? {},
        });
        // Promote to cognitive knowledge on critical thresholds
        if (event.cpuPct >= THRESHOLDS.CPU_CRIT || event.memPct >= THRESHOLDS.MEM_CRIT) {
          storeKnowledge("crash",
            `threshold:${event.layer}:${event.resourceId}`,
            `${event.layer} ${event.resourceId} near saturation — cpu=${event.cpuPct}% mem=${event.memPct}%`,
            { cpuPct: event.cpuPct, memPct: event.memPct },
            0.95,
          );
        }
        return { event: event.type, learned: true, severity };
      }

      case "optimization": {
        recordOptimization({
          resourceId:  event.resourceId,
          optType:     event.optType,
          before:      event.before,
          after:       event.after,
          improvement: event.improvement,
          note:        event.note ?? "",
        });
        storeVector(
          `opt:${event.resourceId}:${event.optType}`,
          `optimization ${event.optType} ${event.resourceId} improvement ${event.improvement}`,
          { optType: event.optType },
        );
        return { event: event.type, learned: true, note: `improvement=${event.improvement}` };
      }

      case "attack": {
        storeKnowledge("attack", `attack:${event.signature}`,
          `Attack pattern detected: ${event.signature}`,
          { source: event.source, targetService: event.targetService, ...event.meta },
          0.9,
        );
        storeVector(`attack:${event.signature}`, `attack ${event.signature} ${event.targetService ?? ""}`, { type: "attack" });
        return { event: event.type, learned: true, note: event.signature };
      }

      default:
        return { event: "unknown", learned: false };
    }
  } catch {
    return { event: (event as LearnEvent).type, learned: false, note: "internal_error" };
  }
}

/** Batch process multiple events. */
export function learnBatch(events: LearnEvent[]): LearningResult[] {
  return events.map(learn);
}
