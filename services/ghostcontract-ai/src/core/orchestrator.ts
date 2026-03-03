/**
 * GhostContractAI — Core Orchestrator
 *
 * Entry point for all autonomous job execution.
 * Enforces: policy → memory budget → workspace → plan → agent → evidence.
 */

import { enforcePolicy } from "./policy.js";
import { withMemoryBudget } from "./memory.js";
import { createWorkspace } from "./workspace.js";
import { buildEvidencePack } from "./evidence.js";
import type { Job, JobResult } from "../types/jobs.js";
import { runPlanner } from "../agents/planner.js";
import { runCreator } from "../agents/creator.js";
import { runFixer } from "../agents/fixer.js";
import { runUpgrader } from "../agents/upgrader.js";
import { runCompiler } from "../agents/compiler.js";
import { runAuditor } from "../agents/auditor.js";
import { recordOutcome } from "../agents/learner.js";
import {
  updateJobStatus,
  updateJobResult,
  updateJobPlanSteps,
} from "../store/sqlite.js";
import { logger } from "../logger.js";

// ─── Concurrency semaphore ────────────────────────────────────────────────────

let _activeJobs = 0;
const _MAX_JOBS = Number(process.env.GHOSTAI_MAX_JOBS ?? 1);

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function runJob(job: Job): Promise<JobResult> {
  if (_activeJobs >= _MAX_JOBS) {
    throw new Error(
      `Max concurrent jobs reached (${_MAX_JOBS}). Job ${job.id} rejected.`,
    );
  }

  _activeJobs++;
  const jobStart = Date.now();

  try {
    return await withMemoryBudget(async () => {
      // 1. Policy gate (throws PolicyViolationError on violation)
      enforcePolicy(job);

      updateJobStatus(job.id, "planning", { startedAt: new Date().toISOString() });

      // 2. Create sandbox workspace
      const { ws, cleanup } = await createWorkspace(job);

      try {
        // 3. Plan
        const plan = await runPlanner(job, ws);
        updateJobPlanSteps(job.id, plan.steps);
        updateJobStatus(job.id, "running");

        // 4. Dispatch to agent
        let result: JobResult;
        switch (job.type) {
          case "CONTRACT_CREATE":
            result = await runCreator(job, ws, plan);
            break;
          case "CONTRACT_FIX":
            result = await runFixer(job, ws, plan);
            break;
          case "CONTRACT_UPGRADE":
            result = await runUpgrader(job, ws, plan);
            break;
          case "CONTRACT_COMPILE":
            result = await runCompiler(job, ws, plan);
            break;
          case "CONTRACT_AUDIT":
            result = await runAuditor(job, ws, plan);
            break;
          default:
            throw new Error(`Unknown job type: ${(job as { type: string }).type}`);
        }

        // 5. Build evidence pack
        const evidence = await buildEvidencePack(job, ws, result);
        result.evidence = evidence;

        // 6. Persist result
        updateJobResult(job.id, result);
        updateJobStatus(job.id, result.success ? "succeeded" : "failed", {
          finishedAt: new Date().toISOString(),
        });

        // 7. Record outcome for learner (bounded, non-blocking)
        const latencyMs = Date.now() - jobStart;
        recordOutcome(job, plan, result, latencyMs).catch((err) =>
          logger.warn("Learner recordOutcome failed (non-fatal)", { err: String(err) }),
        );

        logger.info("Job completed", {
          jobId: job.id,
          type: job.type,
          success: result.success,
          latencyMs,
        });

        return result;
      } finally {
        await cleanup();
      }
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    updateJobStatus(job.id, "failed", {
      finishedAt: new Date().toISOString(),
      error: errMsg,
    });
    logger.error("Job failed", { jobId: job.id, type: job.type, error: errMsg });
    throw err;
  } finally {
    _activeJobs--;
  }
}

export function activeJobCount(): number {
  return _activeJobs;
}
