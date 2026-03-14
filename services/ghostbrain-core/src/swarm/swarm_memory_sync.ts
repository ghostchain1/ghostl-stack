/**
 * GhostBrain Autonomous Swarm — Memory Sync
 *
 * Broadcasts swarm events and agent results into the GhostBrain unified
 * memory system so that higher AI layers (Cognitive Engine, HyperCore)
 * can learn from swarm activity over time.
 */

import { store_event, store_decision } from "../memory_engine.js";
import { log }                          from "../observability/event_logger.js";
import type { SwarmEvent, SwarmResult } from "./swarm_types.js";

// ── Public API ────────────────────────────────────────────────────────────────

/** Persist a swarm event into the unified memory system. */
export function broadcastEvent(event: SwarmEvent): void {
  try {
    store_event({
      category:   "swarm",
      label:      event.type,
      resourceId: event.resourceId,
      layer:      "swarm",
      severity:   event.severity === "critical" ? "critical"
                : event.severity === "warn"     ? "warning"
                : "info",
      payload:    event.payload,
    });
  } catch (err) {
    log.warn("swarm_memory_sync: event_failed", String(err));
  }
}

/** Persist a swarm task result as an AI decision for outcome tracking. */
export function broadcastResult(result: SwarmResult): void {
  try {
    store_decision({
      agent:        result.agentName,
      decisionType: `swarm:${result.domain}`,
      resourceId:   result.taskId,
      layer:        "swarm",
      rationale:    result.detail,
      confidence:   result.ok ? 0.9 : 0.1,
      actionTaken:  {
        domain:     result.domain,
        ok:         result.ok,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    log.warn("swarm_memory_sync: result_failed", String(err));
  }
}
