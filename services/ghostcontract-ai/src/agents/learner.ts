/**
 * GhostContractAI — Learner Agent
 *
 * Records job outcomes into SQLite and updates UCB1 bandit stats.
 * Never modifies policy, guardrails, or config files.
 * New "capabilities" are emitted as proposal artifacts only.
 */

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { Job, Plan, JobResult } from "../types/jobs.js";
import { recordLearnerOutcome } from "../store/sqlite.js";
import { logger } from "../logger.js";

/**
 * Record the outcome of a completed job.
 * Identifies the strategy used from the plan, hashes any failure signature,
 * and updates the bandit table accordingly.
 */
export async function recordOutcome(
  job: Job,
  plan: Plan,
  result: JobResult,
  latencyMs: number,
): Promise<void> {
  try {
    // Derive strategy from the planner step choices
    const strategyUsed = _detectStrategy(plan);

    // Compute failure signature if the job failed
    const failureSig = result.success
      ? undefined
      : _failureSignature(result);

    recordLearnerOutcome(
      randomUUID(),
      job.type,
      strategyUsed,
      result.success,
      latencyMs,
      failureSig,
    );

    logger.info("Learner: outcome recorded", {
      jobId: job.id,
      type: job.type,
      strategy: strategyUsed,
      success: result.success,
      latencyMs,
    });
  } catch (err) {
    // Learner failures are never fatal
    logger.warn("Learner: recordOutcome threw (non-fatal)", { err: String(err) });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _detectStrategy(plan: Plan): string {
  for (const step of plan.steps) {
    if (step.tool === "ripgrep_fix") return "ripgrep_fix";
    if (step.tool === "llm_fix") return "llm_fix";
    if (step.tool === "upgrade_plan") return `upgrade_${step.args["strategy"] ?? "uups"}`;
    if (step.tool === "template_render") return `create_${step.args["templateId"] ?? "erc20"}`;
  }
  return "default";
}

function _failureSignature(result: JobResult): string {
  // Stable hash of the failure pattern for bandit correlation
  const snippet =
    result.artifacts?.["compileLogs"]?.slice(0, 500) ??
    result.summary.slice(0, 200);
  return createHash("sha256").update(snippet).digest("hex").slice(0, 16);
}
