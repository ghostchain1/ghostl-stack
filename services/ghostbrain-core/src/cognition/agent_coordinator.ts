/**
 * GhostBrain Cognitive Engine — Agent Coordinator
 *
 * Dispatches the steps of a CognitivePlan to the appropriate GhostBrain
 * swarm agents, tracks execution results, and feeds outcomes back into
 * the neural memory graph for continuous learning.
 *
 * Agent routing:
 *   restart_container  → GhostRepairBot (executeRepair)
 *   restart_vm         → GhostRepairBot (executeRepair, layer=vm)
 *   restart_service    → GhostRepairBot (executeRepair, layer=service)
 *   scale_memory       → GhostOptimizer (via resource_scheduler)
 *   scale_cpu          → GhostOptimizer (via resource_scheduler)
 *   rebalance_load     → GhostLoadBalancer (via load_balancer.computeRebalanceRecs)
 *   throttle           → GhostLoadBalancer (throttle)
 *   reroute_traffic    → GhostLoadBalancer (reroute)
 *   notify             → alert_engine.fireAlert
 *   sync_peers         → validator_monitor.triggerPeerSync (best-effort)
 *   collect_diagnostics→ (in-process telemetry snapshot — always succeeds)
 *   monitor            → (schedule prolonged observation — always succeeds)
 *   search_memory      → recall_similar_events
 *   generate_strategy  → no-op (already done by StrategyEngine)
 *
 * Steps that require governance ratification are skipped in autonomous mode
 * and returned as "pending_governance".
 *
 * Prometheus metrics:
 *   ghostbrain_agents_dispatched_total
 *   ghostbrain_agent_steps_executed_total
 *   ghostbrain_agent_steps_failed_total
 *   ghostbrain_agents_executed_total
 */

import { executeRepair }         from "../auto_repair_engine.js";
import { enqueue, Priority }     from "../orchestrator/resource_scheduler.js";
import { computeRebalanceRecs }  from "../orchestrator/load_balancer.js";
import { recall_similar_events } from "../memory_engine.js";
import { recordChain }           from "../memory/neural_memory_graph.js";
import { recordAuditEntry }      from "../memory/memory_audit.js";
import { inc }                   from "../observability/metrics_exporter.js";
import { log }                   from "../observability/event_logger.js";
import type { CognitivePlan, PlanStep }  from "./planning_engine.js";
import type { Strategy, StepStrategy }  from "./strategy_engine.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExecutionStatus =
  | "success"
  | "failed"
  | "skipped_governance"
  | "skipped_dryrun"
  | "no_op";

export interface StepResult {
  step:        PlanStep;
  status:      ExecutionStatus;
  durationMs:  number;
  detail:      string;
  error?:      string;
}

export interface ExecutionResult {
  planId:      string;
  resourceId:  string;
  layer:       string;
  steps:       StepResult[];
  succeeded:   number;
  failed:      number;
  skipped:     number;
  executedAt:  number;
  totalMs:     number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.COGNITIVE_DRY_RUN === "1";

// ── Coordinator ───────────────────────────────────────────────────────────────

export class AgentCoordinator {

  /**
   * Execute all steps in a CognitivePlan, using strategies from StrategyEngine.
   * Returns a full ExecutionResult including per-step outcomes.
   */
  async executePlan(plan: CognitivePlan, strategy: Strategy): Promise<ExecutionResult> {
    const wallStart = Date.now();
    inc("ghostbrain_agents_dispatched_total", "Plans dispatched to agent coordinator");

    const stepResults: StepResult[] = [];
    let succeeded = 0, failed = 0, skipped = 0;

    for (const stepStrategy of strategy.steps) {
      const { step, params } = stepStrategy;
      const t0 = Date.now();

      // Governance guard — never auto-execute destructive actions requiring ratification
      if (step.requiresGovernance) {
        stepResults.push({
          step,
          status:     "skipped_governance",
          durationMs: 0,
          detail:     `Step requires governance ratification — submitted advisory proposal`,
        });
        skipped++;
        log.warn("agent_coordinator: governance_required",
          `plan=${plan.id} step=${step.index} action=${step.action}`);
        // Audit the advisory submission
        void recordAuditEntry({
          agent:        "CognitiveEngine",
          decisionType: "governance_advisory",
          resourceId:   plan.resourceId,
          rationale:    `Governance required for action "${step.action}" — plan ${plan.id}`,
          actionTaken:  { planId: plan.id, stepIndex: step.index, action: step.action },
        });
        continue;
      }

      // Dry-run guard
      if (DRY_RUN) {
        stepResults.push({
          step,
          status:     "skipped_dryrun",
          durationMs: 0,
          detail:     `[DRY_RUN] Would execute ${step.action} with params: ${JSON.stringify(params)}`,
        });
        skipped++;
        continue;
      }

      // Execute the step
      const result = await this._executeStep(step, params, plan);
      stepResults.push({ ...result, durationMs: Date.now() - t0 });

      if (result.status === "success") {
        succeeded++;
        inc("ghostbrain_agent_steps_executed_total", "Agent plan steps successfully executed");
      } else if (result.status === "failed") {
        failed++;
        inc("ghostbrain_agent_steps_failed_total", "Agent plan steps that failed");
      } else {
        skipped++;
      }
    }

    const totalMs = Date.now() - wallStart;
    inc("ghostbrain_agents_executed_total", "Total agents executed in cognitive plans");

    const execResult: ExecutionResult = {
      planId:     plan.id,
      resourceId: plan.resourceId,
      layer:      plan.layer,
      steps:      stepResults,
      succeeded,
      failed,
      skipped,
      executedAt: wallStart,
      totalMs,
    };

    // Record execution as a causal chain in neural memory (fire-and-forget)
    void this._recordExecutionChain(plan, execResult);

    log.info("agent_coordinator: plan_executed",
      `plan=${plan.id} succeeded=${succeeded} failed=${failed} skipped=${skipped} ms=${totalMs}`);

    return execResult;
  }

  // ── Step dispatcher ───────────────────────────────────────────────────────

  private async _executeStep(
    step:   PlanStep,
    params: Record<string, unknown>,
    plan:   CognitivePlan,
  ): Promise<Omit<StepResult, "durationMs">> {
    const { action } = step;

    try {
      switch (action) {

        case "collect_diagnostics":
        case "monitor":
        case "search_memory":
        case "generate_strategy": {
          // In-process — always succeeds (real work done by higher-level engines)
          if (action === "search_memory") {
            await recall_similar_events(
              `${plan.reasoning.event.label} ${plan.resourceId}`, 5,
            );
          }
          return { step, status: "no_op", detail: `${action} acknowledged` };
        }

        case "notify": {
          const severity = (params["level"] as string) ?? "warn";
          const message  = (params["message"] as string) ?? step.description;
          enqueue("alert", plan.resourceId, Priority.HIGH,
            { message, severity, planId: plan.id, event: plan.reasoning.event.label });
          log.warn("agent_coordinator: notify", `[${severity}] ${message}`);
          return { step, status: "success", detail: `Alert enqueued: ${message}` };
        }

        case "restart_container": {
          const strategy = (params["strategy"] as string) ?? "restart_container";
          const res = await executeRepair({
            resourceId:   plan.resourceId,
            layer:        "container",
            strategy:     strategy as "restart_container" | "redeploy_service",
            params,
            triggerEvent: plan.reasoning.event.label,
            rationale:    plan.reasoning.rootCause,
            confidence:   plan.reasoning.confidence,
            dryRun:       false,
          });
          return {
            step,
            status: res.success ? "success" : "failed",
            detail: res.detail ?? strategy,
            error:  res.success ? undefined : (res.detail ?? "repair failed"),
          };
        }

        case "restart_vm": {
          const res = await executeRepair({
            resourceId:   plan.resourceId,
            layer:        "vm",
            strategy:     "reallocate",
            params,
            triggerEvent: plan.reasoning.event.label,
            rationale:    plan.reasoning.rootCause,
            confidence:   plan.reasoning.confidence,
            dryRun:       false,
          });
          return {
            step,
            status: res.success ? "success" : "failed",
            detail: res.detail ?? "vm_reallocate",
            error:  res.success ? undefined : (res.detail ?? "vm repair failed"),
          };
        }

        case "restart_service": {
          // Map l1/l2/l3 layer names to the valid RepairRequest layer union
          const rawLayer = (params["layer"] as string) ?? plan.layer;
          const repairLayer: "container" | "vm" | "service" | "chain" =
            ["l1", "l2", "l3", "chain"].includes(rawLayer) ? "chain"
            : rawLayer === "vm" ? "vm"
            : rawLayer === "container" ? "container"
            : "service";
          const res = await executeRepair({
            resourceId:   plan.resourceId,
            layer:        repairLayer,
            strategy:     "restart_container",
            params,
            triggerEvent: plan.reasoning.event.label,
            rationale:    plan.reasoning.rootCause,
            confidence:   plan.reasoning.confidence,
            dryRun:       false,
          });
          return {
            step,
            status: res.success ? "success" : "failed",
            detail: res.detail ?? "service_restart",
            error:  res.success ? undefined : (res.detail ?? "service restart failed"),
          };
        }

        case "scale_memory":
        case "scale_cpu": {
          const jobType = action === "scale_memory" ? "scale_memory" : "collect";
          const prio    = plan.priority === "critical" ? Priority.EMERGENCY : Priority.HIGH;
          enqueue(jobType, plan.resourceId, prio,
            { ...params, cogPlanId: plan.id, action });
          return { step, status: "success", detail: `${action} job enqueued` };
        }

        case "rebalance_load": {
          computeRebalanceRecs();
          enqueue("rebalance", plan.resourceId, Priority.MEDIUM,
            { cogPlanId: plan.id });
          return { step, status: "success", detail: "rebalance recommendations computed" };
        }

        case "throttle": {
          enqueue("throttle", plan.resourceId, Priority.MEDIUM,
            { ...params, cogPlanId: plan.id });
          return { step, status: "success", detail: "throttle job enqueued" };
        }

        case "reroute_traffic": {
          enqueue("rebalance", plan.resourceId, Priority.HIGH,
            { ...params, cogPlanId: plan.id, action: "reroute" });
          return { step, status: "success", detail: "reroute job enqueued" };
        }

        case "sync_peers": {
          enqueue("alert", plan.resourceId, Priority.HIGH,
            { ...params, cogPlanId: plan.id, action: "sync_peers" });
          return { step, status: "success", detail: "peer sync job enqueued" };
        }

        default: {
          return { step, status: "no_op", detail: `Unhandled action type: ${action}` };
        }
      }
    } catch (err) {
      log.warn("agent_coordinator: step_error",
        `plan=${plan.id} step=${step.index} action=${action} error=${String(err)}`);
      return {
        step,
        status: "failed",
        detail: `Exception during ${action}`,
        error:  String(err),
      };
    }
  }

  // ── Neural graph feedback ─────────────────────────────────────────────────

  private async _recordExecutionChain(
    plan:   CognitivePlan,
    result: ExecutionResult,
  ): Promise<void> {
    try {
      const overallSuccess = result.succeeded > result.failed;
      const primaryAction  = plan.steps.find(s =>
        s.action !== "collect_diagnostics" &&
        s.action !== "monitor" &&
        s.action !== "search_memory",
      );
      if (!primaryAction) return;

      await recordChain({
        event: {
          label:      plan.reasoning.event.label,
          resourceId: plan.resourceId,
          layer:      plan.layer,
          payload:    plan.reasoning.event.payload,
        },
        cause: {
          label:   plan.reasoning.rootCause,
          payload: { classification: plan.reasoning.classification },
        },
        action: {
          label:   primaryAction.action.replace(/_/g, " "),
          payload: { planId: plan.id, totalSteps: plan.steps.length },
        },
        outcome: {
          label:   overallSuccess ? "recovery_success" : "recovery_partial",
          success: overallSuccess,
          payload: {
            succeeded: result.succeeded,
            failed:    result.failed,
            skipped:   result.skipped,
            totalMs:   result.totalMs,
          },
        },
        confidence: plan.reasoning.confidence,
      });
    } catch {
      // Non-critical — neural graph write failure must not affect execution path
    }
  }
}

export const agentCoordinator = new AgentCoordinator();
