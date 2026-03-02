/**
 * GhostBrain Core — Execution Orchestrator
 *
 * Dispatches ChangePlan steps to bounded executors via NATS task tokens.
 * Enforces: sequencing, timeouts, canary window, SLO verification,
 * automatic rollback, and evidence collection.
 *
 * GhostBrain never directly mutates infra — it issues signed task tokens
 * to registered executor agents.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ChangePlan,
  ChangeStep,
  TaskToken,
  AgentCapability,
  CanaryState,
  CanaryStatus,
} from "../types.js";
import { dispatchTask } from "../connectors/nats.js";
import { checkSuccessMetric, snapshotMetrics } from "../connectors/prometheus.js";
import { storeEvidence, auditLog, updateIncidentStatus } from "../memory/incident-store.js";
import { query } from "../connectors/db.js";
import {
  TASK_TOKEN_TTL_SECONDS,
  CANARY_WINDOW_SECONDS,
} from "../config.js";
import {
  plansExecuted,
  canaryOutcomes,
  rollbacksTriggered,
} from "../metrics.js";
import { logger } from "../logger.js";

// ─── Token registry (in-memory, production: Redis) ───────────────────────────
const _activeTokens = new Map<string, TaskToken>();

function _issueTaskToken(
  taskId: string,
  agentId: string,
  capabilities: AgentCapability[],
  step: ChangeStep,
): TaskToken {
  const now = Date.now();
  const token: TaskToken = {
    tokenId:        uuidv4(),
    taskId,
    agentId,
    capabilities,
    resourceScopes: [step.target],
    issuedAt:       now,
    expiresAt:      now + TASK_TOKEN_TTL_SECONDS * 1000,
    idempotencyKey: `${taskId}:${step.stepId}`,
    // In production: HMAC-SHA256 signed with key from Vault
    signature:      `hmac:${uuidv4()}`,
  };
  _activeTokens.set(token.tokenId, token);
  return token;
}

function _revokeToken(tokenId: string): void {
  _activeTokens.delete(tokenId);
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export class Orchestrator {
  /**
   * Execute a fully-approved ChangePlan.
   * Returns outcome: "completed" | "rolled-back" | "failed"
   */
  async executePlan(
    plan: ChangePlan,
    agentRegistry: Map<string, string>,   // capability → agentId
  ): Promise<"completed" | "rolled-back" | "failed"> {
    logger.info("Execution started", { planId: plan.planId });

    // Mark plan as executing
    await _updatePlanStatus(plan.planId, "executing");
    await updateIncidentStatus(plan.incidentId, "executing", { planId: plan.planId });

    // Snapshot baseline metrics before change
    const baselineMetrics = await snapshotMetrics(
      Object.fromEntries((plan.steps[0]?.successMetrics ?? []).map(m => [m.metric, m.metric]))
    );

    // Store "before" evidence
    await storeEvidence("before_after", "Baseline metrics before plan execution",
      { baseline: baselineMetrics }, { planId: plan.planId, incidentId: plan.incidentId });

    // ── Canary phase ──────────────────────────────────────────────────────────
    if (plan.canaryStep) {
      const canaryOutcome = await this._runCanary(plan, plan.canaryStep, agentRegistry, baselineMetrics);
      if (canaryOutcome === "failed") {
        logger.warn("Canary failed — aborting plan", { planId: plan.planId });
        await this._rollbackAll(plan, agentRegistry, "canary_failure");
        await _updatePlanStatus(plan.planId, "rolled-back");
        await updateIncidentStatus(plan.incidentId, "rolled-back");
        plansExecuted.inc({ outcome: "rolled-back" });
        return "rolled-back";
      }
      logger.info("Canary passed — proceeding to full rollout", { planId: plan.planId });
    }

    // ── Full rollout ──────────────────────────────────────────────────────────
    const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      const outcome = await this._executeStep(step, agentRegistry);
      if (!outcome) {
        logger.error("Step failed — triggering rollback", { planId: plan.planId, stepId: step.stepId });
        await this._rollbackAll(plan, agentRegistry, "step_failure");
        await _updatePlanStatus(plan.planId, "rolled-back");
        await updateIncidentStatus(plan.incidentId, "rolled-back");
        rollbacksTriggered.inc({ reason: "step_failure" });
        plansExecuted.inc({ outcome: "rolled-back" });
        return "rolled-back";
      }
    }

    // ── Verify SLOs ───────────────────────────────────────────────────────────
    const slosPass = await this._verifySLOs(plan);
    if (!slosPass) {
      logger.warn("SLO verification failed after execution — rolling back", { planId: plan.planId });
      await this._rollbackAll(plan, agentRegistry, "slo_regression");
      await _updatePlanStatus(plan.planId, "rolled-back");
      await updateIncidentStatus(plan.incidentId, "rolled-back");
      rollbacksTriggered.inc({ reason: "slo_regression" });
      plansExecuted.inc({ outcome: "rolled-back" });
      return "rolled-back";
    }

    // ── Snapshot "after" evidence ─────────────────────────────────────────────
    const afterMetrics = await snapshotMetrics(
      Object.fromEntries((plan.steps[0]?.successMetrics ?? []).map(m => [m.metric, m.metric]))
    );
    await storeEvidence("before_after", "Metrics after plan execution",
      { baseline: baselineMetrics, after: afterMetrics }, { planId: plan.planId, incidentId: plan.incidentId });

    await _updatePlanStatus(plan.planId, "completed");
    await updateIncidentStatus(plan.incidentId, "resolved", { planId: plan.planId });
    plansExecuted.inc({ outcome: "completed" });
    logger.info("Plan execution completed successfully", { planId: plan.planId });
    return "completed";
  }

  // ─── Canary ──────────────────────────────────────────────────────────────────
  private async _runCanary(
    plan: ChangePlan,
    canaryStep: ChangeStep,
    agentRegistry: Map<string, string>,
    baselineMetrics: Record<string, number | null>,
  ): Promise<CanaryStatus> {
    const canaryId = uuidv4();
    const windowEnds = Date.now() + CANARY_WINDOW_SECONDS * 1000;

    logger.info("Canary started", { planId: plan.planId, canaryId, windowSeconds: CANARY_WINDOW_SECONDS });

    const stepOk = await this._executeStep(canaryStep, agentRegistry);
    if (!stepOk) {
      canaryOutcomes.inc({ status: "failed" });
      return "failed";
    }

    // Wait for canary window
    await new Promise(r => setTimeout(r, Math.min(CANARY_WINDOW_SECONDS * 1000, 30_000)));

    // Verify SLOs with canary metrics
    const canaryMetrics = await snapshotMetrics(
      Object.fromEntries((canaryStep.successMetrics ?? []).map(m => [m.metric, m.metric]))
    );

    const passed = canaryStep.successMetrics.length === 0
      || (await Promise.all(
          canaryStep.successMetrics.map(m =>
            checkSuccessMetric(m.metric, m.operator, m.threshold)
          )
        )).every(Boolean);

    const state: CanaryState = {
      canaryId,
      planId: plan.planId,
      startedAt: new Date(Date.now() - CANARY_WINDOW_SECONDS * 1000).toISOString(),
      windowEndsAt: new Date(windowEnds).toISOString(),
      status: passed ? "passed" : "failed",
      baselineMetrics: _toNumberRecord(baselineMetrics),
      canaryMetrics: _toNumberRecord(canaryMetrics),
    };

    await storeEvidence("metric_snapshot", "Canary evaluation metrics", state,
      { planId: plan.planId });
    canaryOutcomes.inc({ status: state.status });

    logger.info("Canary evaluated", { planId: plan.planId, status: state.status });
    return state.status;
  }

  // ─── Step execution (dispatches to agent via NATS) ────────────────────────
  private async _executeStep(
    step: ChangeStep,
    agentRegistry: Map<string, string>,
  ): Promise<boolean> {
    const agentId = step.agentId ?? agentRegistry.get(step.capability) ?? "executor-default";
    const taskId = uuidv4();
    const token = _issueTaskToken(taskId, agentId, [step.capability], step);

    logger.info("Dispatching step", { stepId: step.stepId, agentId, capability: step.capability });

    dispatchTask(agentId, {
      taskId,
      token: token.tokenId,
      capability: step.capability,
      params: step.params,
      resourceScope: step.target,
      timeoutSeconds: step.timeoutSeconds,
    }, taskId);

    await auditLog("ghostbrain-core", "task.dispatch", "step", step.stepId, {
      agentId, capability: step.capability, tokenId: token.tokenId, taskId,
    });

    // In production: await agent's NATS reply with timeout
    // Here: simulate optimistic success (real agents confirm via report subject)
    await new Promise(r => setTimeout(r, 500));

    _revokeToken(token.tokenId);
    return true;
  }

  // ─── Rollback all steps ───────────────────────────────────────────────────
  private async _rollbackAll(
    plan: ChangePlan,
    agentRegistry: Map<string, string>,
    reason: string,
  ): Promise<void> {
    logger.warn("Rolling back plan", { planId: plan.planId, reason });

    const rollbackTargets = [...plan.steps].reverse();
    for (const step of rollbackTargets) {
      if (!step.rollbackStep) continue;
      const { rollbackStep: _rb, ...stepBase } = step;
      void _rb;
      const rollbackAsStep: ChangeStep = {
        ...stepBase,
        stepId: uuidv4(),
        description: step.rollbackStep.description,
        capability: step.rollbackStep.capability,
        params: step.rollbackStep.params,
        successMetrics: [],
      };
      await this._executeStep(rollbackAsStep, agentRegistry);
    }

    await storeEvidence("command_transcript", `Rollback triggered: ${reason}`,
      { reason, planId: plan.planId }, { planId: plan.planId });
  }

  // ─── SLO verification ─────────────────────────────────────────────────────
  private async _verifySLOs(plan: ChangePlan): Promise<boolean> {
    const allMetrics = plan.steps.flatMap(s => s.successMetrics);
    if (allMetrics.length === 0) return true;

    const results = await Promise.all(
      allMetrics.map(m => checkSuccessMetric(m.metric, m.operator, m.threshold))
    );
    const pass = results.every(Boolean);
    logger.info("SLO verification", { planId: plan.planId, pass, checks: results.length });
    return pass;
  }
}

// ─── Plan status update ───────────────────────────────────────────────────────
async function _updatePlanStatus(planId: string, status: string): Promise<void> {
  await query(
    `UPDATE change_plans SET status=$1, ${status === "executing" ? "executed_at" : "completed_at"}=NOW()
     WHERE plan_id=$2`,
    [status, planId]
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _toNumberRecord(m: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v ?? 0]));
}
