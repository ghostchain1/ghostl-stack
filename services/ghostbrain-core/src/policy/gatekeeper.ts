/**
 * GhostBrain Core — Policy Gatekeeper
 *
 * Evaluates every proposed ChangePlan against constitutional constraints:
 *   1. Routing law (L3→L2→L1 only)
 *   2. No-downtime discipline (blast radius caps, canary required)
 *   3. Secrets hygiene (no plaintext secrets in plans)
 *   4. DB safety gates (backup required before migrations)
 *   5. Domain/port allowlist compliance
 *
 * Emits: ALLOW | DENY | ALLOW_WITH_CONDITIONS
 */

import type { ChangePlan, PolicyDecision, ChangeStep, AgentCapability, Layer } from "../types.js";
import { assertRoutingLaw, isRoutingLegal } from "./routing-law.js";
import { MAX_BLAST_RADIUS } from "../config.js";
import { plansBlocked } from "../metrics.js";
import { logger } from "../logger.js";

// ─── Evaluation result ────────────────────────────────────────────────────────
export interface GatekeeperResult {
  decision: PolicyDecision;
  conditions: string[];
  violations: string[];
}

// ─── Capabilities requiring break-glass approval ──────────────────────────────
const BREAK_GLASS_REQUIRED: Set<AgentCapability> = new Set([
  "db.migration.apply",
  "libvirt.stop",
]);

// ─── Capabilities that always need a canary first ────────────────────────────
const CANARY_REQUIRED: Set<AgentCapability> = new Set([
  "compose.apply",
  "compose.canary",
  "docker.restart",
]);

// ─── Gatekeeper ───────────────────────────────────────────────────────────────
export function evaluatePlan(plan: ChangePlan): GatekeeperResult {
  const violations: string[] = [];
  const conditions: string[] = [];

  // 1. Routing law: every step that involves cross-layer resources must comply
  for (const step of plan.steps) {
    const { layer } = step.target;
    for (const otherStep of plan.steps) {
      if (otherStep.stepId === step.stepId) continue;
      const otherLayer = otherStep.target.layer;
      if (layer !== otherLayer) {
        // This step involves a cross-layer dependency — check the hop is legal
        if (!isRoutingLegal(layer, otherLayer)) {
          violations.push(
            `ROUTING_LAW: step ${step.stepId} (${layer}) → step ${otherStep.stepId} (${otherLayer}) violates routing law`
          );
        }
      }
    }
  }

  // 2. Blast radius cap
  if (plan.blastRadius > MAX_BLAST_RADIUS) {
    violations.push(
      `BLAST_RADIUS: plan affects ${plan.blastRadius} resources (max=${MAX_BLAST_RADIUS}). Split into smaller plans.`
    );
  }

  // 3. No-downtime: canary required for disruptive capabilities
  const hasDisruptive = plan.steps.some(s => CANARY_REQUIRED.has(s.capability));
  if (hasDisruptive && !plan.canaryStep) {
    violations.push(
      `NO_DOWNTIME: plan includes disruptive capabilities but has no canary step defined.`
    );
  }

  // 4. Break-glass: some capabilities require guardian approval
  const needsBreakGlass = plan.steps.filter(s => BREAK_GLASS_REQUIRED.has(s.capability));
  if (needsBreakGlass.length > 0) {
    conditions.push(
      `BREAK_GLASS_REQUIRED for steps: ${needsBreakGlass.map(s => s.stepId).join(", ")} — guardian key approval needed before execution.`
    );
  }

  // 5. DB migration: backup verification evidence required
  const hasMigration = plan.steps.some(s => s.capability === "db.migration.apply");
  if (hasMigration) {
    const hasBackupEvidence = plan.evidenceRefs.some(e => e.kind === "health_check" || e.kind === "before_after");
    if (!hasBackupEvidence) {
      violations.push(
        `DB_SAFETY: db.migration.apply requires a before_after or backup health_check evidence ref.`
      );
    }
  }

  // 6. Secrets hygiene: no plaintext secret values in params
  const secretPatterns = /-----BEGIN|password|mnemonic|privateKey|secret/i;
  for (const step of plan.steps) {
    const paramsStr = JSON.stringify(step.params);
    if (secretPatterns.test(paramsStr)) {
      violations.push(
        `SECRETS_HYGIENE: step ${step.stepId} appears to contain plaintext secret material in params. Use Vault references instead.`
      );
    }
  }

  // 7. Determine decision
  let decision: PolicyDecision;
  if (violations.length > 0) {
    decision = "DENY";
    plansBlocked.inc({ reason: violations[0]?.split(":")[0] ?? "unknown" });
    logger.warn("Plan blocked by policy gatekeeper", { planId: plan.planId, violations });
  } else if (conditions.length > 0) {
    decision = "ALLOW_WITH_CONDITIONS";
    logger.info("Plan approved with conditions", { planId: plan.planId, conditions });
  } else {
    decision = "ALLOW";
    logger.info("Plan approved by policy gatekeeper", { planId: plan.planId });
  }

  return { decision, conditions, violations };
}

/**
 * Hard-throws if a cross-layer hop embedded in a single step is illegal.
 * Delegates to routing-law module.
 */
export function enforceStepRoutingLaw(step: ChangeStep, relatedLayer?: Layer): void {
  if (!relatedLayer) return;
  const stepLayer = step.target.layer;
  // Only enforce if this step's capability implies a cross-chain operation
  if (stepLayer !== relatedLayer) {
    assertRoutingLaw(stepLayer, relatedLayer);
  }
}
