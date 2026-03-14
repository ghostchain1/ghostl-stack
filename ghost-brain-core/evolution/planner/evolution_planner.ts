/**
 * GhostBrain Self-Evolution Engine — Evolution Planner
 *
 * Reads from the Memory Engine (pattern history + predictions) and the
 * consensus output of the Swarm AI to derive a prioritised list of
 * EvolutionTask objects describing concrete improvements to make.
 *
 * The planner is purely analytical — it produces task descriptions
 * only. It does not generate code, modify files, or submit proposals.
 *
 * Dedup logic: tasks with the same (kind, trigger-set) are not repeated
 * if the previous task for that pair has been submitted within
 * TASK_COOLDOWN_MS (default 6 hours). This prevents the engine from
 * planning the same improvement every tick.
 */

import { randomUUID } from "crypto";
import type { MemoryReader }    from "../../memory/engine/memory_reader.js";
import type { PatternDetector } from "../../memory/learning/pattern_detector.js";
import type { FailurePredictor } from "../../memory/learning/failure_predictor.js";
import type { ConsensusActionsPayload } from "../../swarm/messaging/event_channel.js";
import type {
  EvolutionTask,
  EvolutionTaskKind,
} from "../types.js";
import type { EventCategory } from "../../memory/models/system_event.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Don't plan the same task kind + trigger again within this window. */
const TASK_COOLDOWN_MS = parseInt(
  process.env["EVOLUTION_TASK_COOLDOWN_MS"] ?? String(6 * 60 * 60_000), 10,
);

/** Minimum frequency count from pattern detection to trigger a task. */
const MIN_FREQUENCY = parseInt(process.env["EVOLUTION_MIN_FREQUENCY"] ?? "5", 10);

/** Minimum prediction confidence to trigger a governance_propose task. */
const MIN_CONFIDENCE = parseFloat(process.env["EVOLUTION_MIN_CONFIDENCE"] ?? "0.6");

// ---------------------------------------------------------------------------
// Category → task kind mapping
// ---------------------------------------------------------------------------

const CATEGORY_TASK_MAP: Partial<Record<EventCategory, EvolutionTaskKind>> = {
  docker_failure:    "improve_container_recovery",
  docker_oom:        "improve_container_recovery",
  docker_exit:       "improve_container_recovery",
  vm_crash:          "improve_vm_recovery",
  vm_offline:        "improve_vm_recovery",
  network_degraded:  "improve_network_routing",
  network_error_spike: "improve_network_routing",
  anomaly_detected:  "tune_detection_threshold",
  l2_lag:            "refine_risk_scoring",
  risk_alert:        "refine_risk_scoring",
  hypervisor_load:   "update_load_balance_weights",
  hypervisor_mem:    "update_load_balance_weights",
};

// ---------------------------------------------------------------------------
// EvolutionPlanner
// ---------------------------------------------------------------------------

export class EvolutionPlanner {
  /** In-memory cooldown registry: "{kind}::{triggers}" → last planned timestamp. */
  private readonly cooldowns = new Map<string, number>();

  constructor(
    private readonly reader:    MemoryReader,
    private readonly detector:  PatternDetector,
    private readonly predictor: FailurePredictor,
  ) {}

  /**
   * Produce a prioritised list of EvolutionTasks based on current memory state
   * and (optionally) the latest Swarm consensus output.
   *
   * Returns an empty array when no actionable patterns are found or all
   * applicable task kinds are in their cooldown window.
   */
  plan(consensus?: ConsensusActionsPayload): EvolutionTask[] {
    const now    = Date.now();
    const tasks: EvolutionTask[] = [];

    // --- Phase 1: pattern-driven tasks ----------------------------------

    const patterns    = this.detector.detect();
    const predictions = this.predictor.predict(patterns);

    for (const pred of predictions) {
      if (pred.confidence < MIN_CONFIDENCE) continue;

      const kind = CATEGORY_TASK_MAP[pred.category];
      if (!kind) continue;

      // Find the backing pattern for frequency info.
      const pattern = patterns.find(p => p.category === pred.category);
      const frequency = pattern?.count ?? 1;
      if (frequency < MIN_FREQUENCY) continue;

      const cooldownKey = `${kind}::${pred.category}`;
      const lastPlanned = this.cooldowns.get(cooldownKey) ?? 0;
      if (now - lastPlanned < TASK_COOLDOWN_MS) continue;

      const priority = Math.min(Math.round(pred.confidence * 100), 99);

      tasks.push({
        id:          randomUUID(),
        kind,
        triggers:    [pred.category],
        frequency,
        priority,
        description:
          `${pred.message}. Proposed improvement: ${kindDescription(kind)}.`,
        createdAt: now,
      });

      this.cooldowns.set(cooldownKey, now);
    }

    // --- Phase 2: consensus-driven tasks --------------------------------

    if (consensus) {
      for (const action of consensus.actions) {
        if (action.confidence < 0.7) continue;

        // Map consensus action kinds to evolution task kinds.
        const kind = consensusKindToTaskKind(action.kind);
        if (!kind) continue;

        const cooldownKey = `${kind}::consensus::${action.target ?? ""}`;
        const lastPlanned = this.cooldowns.get(cooldownKey) ?? 0;
        if (now - lastPlanned < TASK_COOLDOWN_MS) continue;

        tasks.push({
          id:          randomUUID(),
          kind,
          triggers:    [],
          frequency:   action.proposedBy.length,
          priority:    Math.min(action.priority, 99),
          description:
            `Swarm consensus (${action.proposedBy.join(",")}) recommended: ` +
            `${action.description}. Evolution: ${kindDescription(kind)}.`,
          createdAt: now,
        });

        this.cooldowns.set(cooldownKey, now);
      }
    }

    // Sort by priority descending.
    return tasks.sort((a, b) => b.priority - a.priority);
  }

  /** Total number of active cooldown entries (for diagnostics). */
  get activeCooldowns(): number { return this.cooldowns.size; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kindDescription(kind: EvolutionTaskKind): string {
  const map: Record<EvolutionTaskKind, string> = {
    improve_container_recovery: "enhance Docker container recovery and restart policies",
    improve_vm_recovery:        "strengthen VM crash detection and automatic restart logic",
    tune_detection_threshold:   "recalibrate anomaly detection thresholds based on observed data",
    add_memory_category:        "introduce a new memory event category to improve observability",
    improve_network_routing:    "update network interface routing preferences and retry policies",
    update_load_balance_weights:"re-tune resource optimizer CPU/memory/connection weight coefficients",
    refine_risk_scoring:        "improve the risk confidence formula with updated weighting",
    add_swarm_agent:            "scaffold a new specialised Swarm AI agent",
  };
  return map[kind];
}

function consensusKindToTaskKind(
  actionKind: string,
): EvolutionTaskKind | null {
  const map: Record<string, EvolutionTaskKind> = {
    restart_container: "improve_container_recovery",
    rebuild_container: "improve_container_recovery",
    restart_vm:        "improve_vm_recovery",
    scale_up:          "update_load_balance_weights",
    rebalance:         "update_load_balance_weights",
    security_alert:    "refine_risk_scoring",
    monitor_increase:  "tune_detection_threshold",
  };
  return map[actionKind] ?? null;
}
