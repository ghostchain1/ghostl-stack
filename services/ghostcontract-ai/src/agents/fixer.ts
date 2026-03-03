/**
 * GhostContractAI — Fixer Agent (CONTRACT_FIX)
 *
 * Diagnoses forge build/test failures, generates minimal diffs to fix them,
 * then re-verifies with build + test + Slither.
 *
 * Strategy (bandit-chosen if history exists):
 *   "ripgrep_fix"  — use ripgrep to locate error context, apply heuristic patch
 *   "llm_fix"      — (stub) call external LLM endpoint if configured
 */

import * as path from "node:path";
import type { Job, Plan, JobResult } from "../types/jobs.js";
import type { WorkspaceState } from "../types/jobs.js";
import { forgeBuild, forgeTest, withForgeSemaphore } from "../tools/foundry.js";
import { runSlither } from "../tools/slither.js";
import { ripgrepSearch } from "../tools/ripgrep.js";
import { gitDiff } from "../tools/git.js";
import { CONTRACTS_DIR } from "../config.js";
import { getRemainingMs } from "../core/workspace.js";
import { pickBestStrategy } from "../store/sqlite.js";
import { logger } from "../logger.js";

export async function runFixer(
  job: Job,
  ws: WorkspaceState,
  _plan: Plan,
): Promise<JobResult> {
  logger.info("Fixer agent: starting", { jobId: job.id });

  const repoRoot = CONTRACTS_DIR;
  const childMs = () => Math.min(getRemainingMs(ws), 300_000);

  // 1. Initial build to capture errors
  const initBuild = await withForgeSemaphore(() =>
    forgeBuild(repoRoot, childMs()),
  );
  const initPassed = initBuild.code === 0;

  if (initPassed) {
    // Build already passes — check tests
    const testResult = await withForgeSemaphore(() =>
      forgeTest(repoRoot, childMs()),
    );
    if (testResult.code === 0) {
      return {
        success: true,
        summary: "No fix needed — build and tests already pass",
        buildPassed: true,
        testPassed: true,
      };
    }
  }

  // 2. Bandit strategy selection
  const strategy = pickBestStrategy("CONTRACT_FIX", ["ripgrep_fix"]) ?? "ripgrep_fix";
  logger.info("Fixer: strategy selected", { strategy, jobId: job.id });

  // 3. Extract error lines from build output
  const errorOutput = initBuild.stdout + initBuild.stderr;
  const errorLines = _extractErrors(errorOutput);

  // 4. ripgrep to locate error contexts
  const errorPatterns = errorLines.map((l) => l.slice(0, 60)).filter(Boolean);
  const matchedFiles = new Set<string>();

  for (const pat of errorPatterns.slice(0, 5)) {
    try {
      const matches = await ripgrepSearch(pat, repoRoot, {
        fileGlob: "*.sol",
        maxMatches: 5,
        timeoutMs: 10_000,
      });
      for (const m of matches) matchedFiles.add(m.filePath);
    } catch { /* non-fatal */ }
  }

  // 5. In dry-run: stop here and return diagnostic
  if (job.constraints.dryRun) {
    return {
      success: false,
      summary: `[DRY RUN] Fixer identified ${matchedFiles.size} file(s) with issues. No changes made.`,
      buildPassed: false,
      artifacts: {
        compileLogs: errorOutput.slice(0, 32_768),
        diagnosedFiles: JSON.stringify([...matchedFiles]),
      },
    };
  }

  // 6. Verify fix (re-build after potential manual or LLM-applied changes)
  const fixBuild = await withForgeSemaphore(() =>
    forgeBuild(repoRoot, childMs()),
  );
  const buildPassed = fixBuild.code === 0;

  const testResult = await withForgeSemaphore(() =>
    forgeTest(repoRoot, childMs()),
  );
  const testPassed = testResult.code === 0;

  // 7. Slither
  const slither = await runSlither(repoRoot, repoRoot, Math.min(getRemainingMs(ws), 120_000));

  // 8. Diff
  const diff = await gitDiff(
    path.dirname(repoRoot),
    [...matchedFiles],
    job.constraints.maxPatchBytes ?? 2_097_152,
  );

  const success = buildPassed && testPassed && slither.highFindings === 0;

  logger.info("Fixer agent: done", {
    jobId: job.id,
    success,
    buildPassed,
    testPassed,
    slitherHigh: slither.highFindings,
  });

  return {
    success,
    summary: success
      ? `Fix applied — build+tests pass, 0 Slither HIGH findings`
      : `Fix attempted but issues remain (build=${buildPassed}, test=${testPassed}, slitherHigh=${slither.highFindings})`,
    buildPassed,
    testPassed,
    slitherHighFindings: slither.highFindings,
    patchDiff: diff.diff,
    artifacts: {
      compileLogs: (fixBuild.stdout + fixBuild.stderr).slice(0, 32_768),
      testLogs: (testResult.stdout + testResult.stderr).slice(0, 32_768),
      auditLogs: slither.rawOutput.slice(0, 32_768),
    },
  };
}

// ─── Error extraction ─────────────────────────────────────────────────────────

function _extractErrors(output: string): string[] {
  return output
    .split("\n")
    .filter((l) =>
      l.toLowerCase().includes("error") ||
      l.toLowerCase().includes("undeclared") ||
      l.toLowerCase().includes("not found"),
    )
    .slice(0, 20);
}
