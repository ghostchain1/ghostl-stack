/**
 * GhostContractAI — Planner Agent
 *
 * Breaks a job into ordered PlanSteps by analysing job type and context.
 * Uses ripgrep to narrow file search before committing to a plan.
 */

import { randomUUID } from "node:crypto";
import type { Job, Plan, PlanStep, WorkspaceState } from "../types/jobs.js";
import { findSolFiles, ripgrepSearch } from "../tools/ripgrep.js";
import { CONTRACTS_DIR } from "../config.js";
import { getRemainingMs } from "../core/workspace.js";
import { logger } from "../logger.js";

export async function runPlanner(job: Job, ws: WorkspaceState): Promise<Plan> {
  logger.info("Planner: building plan", { jobId: job.id, type: job.type });

  const steps: PlanStep[] = [];

  // Discover relevant Solidity files
  const remainingMs = getRemainingMs(ws);
  const relevantFiles = await _discoverRelevantFiles(job, remainingMs);

  switch (job.type) {
    case "CONTRACT_CREATE":
      steps.push(
        _step("Validate template params", "template_validate", { templateId: job.context.templateId }),
        _step("Render contract from template", "template_render", {
          templateId: job.context.templateId,
          params: job.context.templateParams,
          targetPath: job.context.targetPath,
        }),
        _step("Run forge build", "forge_build", {}),
        _step("Run forge test (if tests present)", "forge_test", {}),
        _step("Run Slither audit", "slither", {}),
        _step("Build evidence pack", "evidence_pack", {}),
      );
      break;

    case "CONTRACT_FIX":
      steps.push(
        _step("Run forge build (diagnose failures)", "forge_build", {}),
        _step("Run forge test (diagnose failures)", "forge_test", {}),
        _step("Search for error patterns", "ripgrep_search", {
          query: job.context.searchQuery ?? "error",
          files: relevantFiles,
        }),
        _step("Generate fix patch", "patch_generate", { files: relevantFiles }),
        _step("Run forge build (verify fix)", "forge_build", {}),
        _step("Run forge test (verify fix)", "forge_test", {}),
        _step("Run Slither audit", "slither", {}),
        _step("Build evidence pack", "evidence_pack", {}),
      );
      break;

    case "CONTRACT_UPGRADE":
      steps.push(
        _step("Inspect current storage layout", "forge_inspect_storage", {
          contract: job.context.contractNames?.[0],
        }),
        _step("Run forge build", "forge_build", {}),
        _step("Analyse storage layout diff", "storage_diff", {}),
        _step("Generate upgrade proposal", "upgrade_plan", {
          strategy: job.context.upgradeStrategy ?? "uups",
        }),
        _step("Generate migration script", "migration_script", {}),
        _step("Run forge test", "forge_test", {}),
        _step("Run Slither audit", "slither", {}),
        _step("Build evidence pack", "evidence_pack", {}),
      );
      break;

    case "CONTRACT_COMPILE":
      steps.push(
        _step("Run forge build", "forge_build", {}),
        _step("Collect artifact hashes", "artifact_hash", {}),
        _step("Build evidence pack", "evidence_pack", {}),
      );
      break;

    case "CONTRACT_AUDIT":
      steps.push(
        _step("Run forge build", "forge_build", {}),
        _step("Run forge test", "forge_test", {}),
        _step("Run Slither full audit", "slither", {}),
        _step("Evaluate Go/No-Go", "go_nogo", {}),
        _step("Build evidence pack", "evidence_pack", {}),
      );
      break;
  }

  const plan: Plan = {
    jobId: job.id,
    steps,
    estimatedMs: _estimateMs(job.type, relevantFiles.length),
    ...(relevantFiles.length === 0 && {
      warnings: ["No Solidity files found matching the job scope"],
    }),
  };

  logger.info("Planner: plan ready", {
    jobId: job.id,
    steps: steps.length,
    files: relevantFiles.length,
  });

  return plan;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _discoverRelevantFiles(
  job: Job,
  timeoutMs: number,
): Promise<string[]> {
  const searchRoot =
    job.targetPaths[0] ??
    CONTRACTS_DIR;

  try {
    if (job.context.contractNames?.length) {
      const results: string[] = [];
      for (const name of job.context.contractNames) {
        const matches = await ripgrepSearch(
          name,
          searchRoot,
          { fileGlob: "*.sol", maxMatches: 10, timeoutMs: Math.min(timeoutMs, 20_000) },
        );
        for (const m of matches) {
          if (!results.includes(m.filePath)) results.push(m.filePath);
        }
      }
      return results;
    }
    // Otherwise return all sol files (capped)
    const all = await findSolFiles(searchRoot, Math.min(timeoutMs, 20_000));
    return all.slice(0, 50);
  } catch {
    return [];
  }
}

function _step(
  label: string,
  tool: string,
  args: Record<string, unknown>,
): PlanStep {
  return {
    id: randomUUID(),
    label,
    tool,
    args,
    status: "pending",
  };
}

function _estimateMs(type: string, fileCount: number): number {
  const base: Record<string, number> = {
    CONTRACT_CREATE: 60_000,
    CONTRACT_FIX: 90_000,
    CONTRACT_UPGRADE: 120_000,
    CONTRACT_COMPILE: 30_000,
    CONTRACT_AUDIT: 180_000,
  };
  const perFile = 2_000;
  return (base[type] ?? 60_000) + fileCount * perFile;
}
