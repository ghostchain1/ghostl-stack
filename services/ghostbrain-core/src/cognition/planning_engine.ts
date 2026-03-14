/**
 * GhostBrain Cognitive Engine — Planning Engine
 *
 * Converts a Reasoning output into a concrete multi-step CognitivePlan.
 *
 * Plan steps are typed action descriptors that the AgentCoordinator can
 * dispatch to specialised swarm agents:
 *
 *   collect_diagnostics  — gather current metrics before acting
 *   restart_container    — restart a Docker container
 *   restart_vm           — restart a libvirt VM
 *   restart_service      — restart a named systemd / compose service
 *   scale_memory         — increase memory allocation
 *   scale_cpu            — increase CPU allocation
 *   rebalance_load       — trigger GhostLoadBalancer rebalance
 *   reroute_traffic      — update routing table entry
 *   throttle             — apply rate limits to a service
 *   sync_peers           — trigger peer sync (validators / cluster)
 *   notify               — emit alert without taking automated action
 *   monitor              — increase monitoring granularity
 *   search_memory        — semantic search for related fixes
 *   generate_strategy    — escalate to StrategyEngine
 *
 * Plans have an immutable ID and carry rollback hints for each step.
 */

import { randomUUID }      from "node:crypto";
import { inc }             from "../observability/metrics_exporter.js";
import { log }             from "../observability/event_logger.js";
import type { Reasoning }  from "./reasoning_engine.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanStepType =
  | "collect_diagnostics"
  | "restart_container"
  | "restart_vm"
  | "restart_service"
  | "scale_memory"
  | "scale_cpu"
  | "rebalance_load"
  | "reroute_traffic"
  | "throttle"
  | "sync_peers"
  | "notify"
  | "monitor"
  | "search_memory"
  | "generate_strategy";

export interface PlanStep {
  /** Sequential step index (0-based) */
  index:      number;
  /** Action type to dispatch */
  action:     PlanStepType;
  /** Human-readable description */
  description: string;
  /** Suggested parameters passed to the executing agent */
  params:     Record<string, unknown>;
  /** Optional rollback action if this step fails */
  rollback?:  PlanStepType;
  /** Whether this step requires governance ratification */
  requiresGovernance: boolean;
}

export type PlanPriority = "low" | "normal" | "high" | "critical";

export interface CognitivePlan {
  id:             string;
  resourceId:     string;
  layer:          string;
  reasoning:      Reasoning;
  steps:          PlanStep[];
  priority:       PlanPriority;
  /** Estimated total recovery time milliseconds */
  estimatedMs:    number;
  createdAt:      number;
}

// ── Templates ─────────────────────────────────────────────────────────────────

/** Standard pre-check step included in most plans. */
function diagnosticStep(index: number, resourceId: string): PlanStep {
  return {
    index,
    action:      "collect_diagnostics",
    description: `Collect current metrics for ${resourceId}`,
    params:      { resourceId },
    requiresGovernance: false,
  };
}

/** Monitoring step appended at the end of every plan. */
function monitorStep(index: number, resourceId: string, durationMs = 120_000): PlanStep {
  return {
    index,
    action:      "monitor",
    description: `Monitor ${resourceId} for ${durationMs / 1000}s post-action`,
    params:      { resourceId, durationMs },
    requiresGovernance: false,
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class PlanningEngine {

  /** Build a CognitivePlan from a Reasoning record. */
  createPlan(reasoning: Reasoning): CognitivePlan {
    inc("ghostbrain_plans_generated_total", "Cognitive plans generated");

    const { event, classification, severity, rootCause } = reasoning;
    const { resourceId, layer } = event;

    const steps: PlanStep[] = [];
    let priority: PlanPriority = "normal";
    let estimatedMs = 30_000;

    // ── Always start with diagnostics ────────────────────────────────────────
    steps.push(diagnosticStep(0, resourceId));

    // ── Plan body based on classification + severity ──────────────────────
    switch (classification) {

      case "known_issue": {
        // We have a fix — execute it directly
        priority = severity === "critical" ? "critical" : "high";
        this._addKnownIssuePlan(steps, event, rootCause, layer, severity);
        estimatedMs = severity === "critical" ? 15_000 : 45_000;
        break;
      }

      case "recurring_pattern": {
        // Known pattern but no reliable fix — try soft recovery + deeper investigation
        priority = "high";
        steps.push({
          index:       steps.length,
          action:      "search_memory",
          description: "Search neural memory for a successful resolution strategy",
          params:      { labelPrefix: event.label, limit: 5 },
          requiresGovernance: false,
        });
        this._addSoftRecoveryPlan(steps, event, layer, severity);
        steps.push({
          index:       steps.length,
          action:      "generate_strategy",
          description: "Escalate to StrategyEngine for optimised action selection",
          params:      { reasoning },
          requiresGovernance: false,
        });
        estimatedMs = 60_000;
        break;
      }

      case "emerging_threat": {
        // Limited data — cautious approach: diagnose and soft remediate
        priority = severity === "high" ? "high" : "normal";
        steps.push({
          index:       steps.length,
          action:      "search_memory",
          description: "Search for any related events in memory",
          params:      { labelPrefix: event.label, limit: 3 },
          requiresGovernance: false,
        });
        this._addSoftRecoveryPlan(steps, event, layer, severity);
        estimatedMs = 90_000;
        break;
      }

      case "novel_issue": {
        // Unseen — observe, collect, escalate; do NOT auto-remediate destructive actions
        priority = "normal";
        steps.push({
          index:       steps.length,
          action:      "search_memory",
          description: "Search entire memory for semantically similar events",
          params:      { labelPrefix: event.label, limit: 10 },
          requiresGovernance: false,
        });
        steps.push({
          index:       steps.length,
          action:      "notify",
          description: `Alert: novel event detected — ${event.label} on ${resourceId}`,
          params:      { level: "warn", event },
          requiresGovernance: false,
        });
        steps.push({
          index:       steps.length,
          action:      "generate_strategy",
          description: "Request strategy for unseen event type",
          params:      { reasoning },
          requiresGovernance: false,
        });
        estimatedMs = 120_000;
        break;
      }
    }

    // ── Always close with monitoring ─────────────────────────────────────────
    const monMs = priority === "critical" ? 300_000 : 120_000;
    steps.push(monitorStep(steps.length, resourceId, monMs));

    const plan: CognitivePlan = {
      id:          randomUUID(),
      resourceId,
      layer,
      reasoning,
      steps,
      priority,
      estimatedMs,
      createdAt:   Date.now(),
    };

    log.info("planning_engine: plan_created",
      `plan=${plan.id} resource=${resourceId} class=${classification} steps=${steps.length} priority=${priority}`);

    return plan;
  }

  // ── Private plan-builders ─────────────────────────────────────────────────

  private _addKnownIssuePlan(
    steps:    PlanStep[],
    event:    Reasoning["event"],
    rootCause: string,
    layer:    string,
    severity: Reasoning["severity"],
  ): void {
    const { resourceId } = event;

    // Memory / CPU saturation
    if (rootCause.includes("memory") || rootCause.includes("mem")) {
      steps.push({
        index:       steps.length,
        action:      "scale_memory",
        description: `Increase memory allocation for ${resourceId}`,
        params:      { resourceId, layer, deltaGiB: severity === "critical" ? 2 : 1 },
        rollback:    "monitor",
        requiresGovernance: severity === "critical",
      });
    }
    if (rootCause.includes("cpu") || rootCause.includes("saturation")) {
      steps.push({
        index:       steps.length,
        action:      "scale_cpu",
        description: `Increase CPU allocation for ${resourceId}`,
        params:      { resourceId, layer, deltaCores: 1 },
        rollback:    "monitor",
        requiresGovernance: false,
      });
    }

    // Container-layer restart
    if (layer === "container") {
      const useRedeploy = severity === "critical" || rootCause.includes("crash");
      steps.push({
        index:       steps.length,
        action:      "restart_container",
        description: `${useRedeploy ? "Redeploy" : "Restart"} container ${resourceId}`,
        params:      { resourceId, strategy: useRedeploy ? "redeploy_service" : "restart_container" },
        rollback:    "notify",
        requiresGovernance: false,
      });
    }

    // VM-layer restart
    if (layer === "vm") {
      steps.push({
        index:       steps.length,
        action:      "restart_vm",
        description: `Restart VM ${resourceId}`,
        params:      { resourceId, force: severity === "critical" },
        rollback:    "notify",
        requiresGovernance: severity === "critical",
      });
    }

    // Service-layer (L1/L2/L3 validators, RPC, sequencers)
    if (["l1", "l2", "l3", "service", "validator"].includes(layer)) {
      steps.push({
        index:       steps.length,
        action:      "restart_service",
        description: `Restart service ${resourceId}`,
        params:      { resourceId, layer },
        rollback:    "notify",
        requiresGovernance: layer === "l1" || layer === "l2",
      });
      if (layer === "l1" || layer === "validator") {
        steps.push({
          index:       steps.length,
          action:      "sync_peers",
          description: `Sync validator peers after ${resourceId} restart`,
          params:      { resourceId, layer },
          requiresGovernance: false,
        });
      }
    }

    // Load rebalance as a universal follow-up
    steps.push({
      index:       steps.length,
      action:      "rebalance_load",
      description: `Rebalance load across ${layer} tier after recovery`,
      params:      { layer, triggeredBy: resourceId },
      requiresGovernance: false,
    });
  }

  private _addSoftRecoveryPlan(
    steps:    PlanStep[],
    event:    Reasoning["event"],
    layer:    string,
    severity: Reasoning["severity"],
  ): void {
    const { resourceId } = event;

    // Throttle as a protective measure
    if (severity === "high" || severity === "critical") {
      steps.push({
        index:       steps.length,
        action:      "throttle",
        description: `Apply temporary throttling to ${resourceId} while investigating`,
        params:      { resourceId, layer, requestsPerSecond: 50 },
        rollback:    "monitor",
        requiresGovernance: false,
      });
    }

    // Soft restart for container/vm layers
    if (layer === "container") {
      steps.push({
        index:       steps.length,
        action:      "restart_container",
        description: `Soft-restart container ${resourceId}`,
        params:      { resourceId, strategy: "restart_container" },
        rollback:    "notify",
        requiresGovernance: false,
      });
    } else if (layer === "vm") {
      steps.push({
        index:       steps.length,
        action:      "restart_vm",
        description: `Soft-restart VM ${resourceId}`,
        params:      { resourceId, force: false },
        rollback:    "notify",
        requiresGovernance: false,
      });
    }

    // Always rebalance after soft recovery
    steps.push({
      index:       steps.length,
      action:      "rebalance_load",
      description: "Rebalance load after soft recovery",
      params:      { layer, triggeredBy: resourceId },
      requiresGovernance: false,
    });
  }
}

export const planningEngine = new PlanningEngine();
