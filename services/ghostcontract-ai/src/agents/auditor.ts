/**
 * GhostContractAI — Auditor Agent (CONTRACT_AUDIT)
 *
 * Runs forge build + forge test + Slither, evaluates Go/No-Go,
 * and emits a full audit result.
 */

import type { Job, Plan, JobResult, TouchedFile } from "../types/jobs.js";
import type { WorkspaceState } from "../types/jobs.js";
import { forgeBuild, forgeTest, withForgeSemaphore } from "../tools/foundry.js";
import { runSlither } from "../tools/slither.js";
import { CONTRACTS_DIR } from "../config.js";
import { getRemainingMs } from "../core/workspace.js";
import { findSolFiles } from "../tools/ripgrep.js";
import { hashFile } from "../tools/fs_stream.js";
import { logger } from "../logger.js";

export async function runAuditor(
  job: Job,
  ws: WorkspaceState,
  _plan: Plan,
): Promise<JobResult> {
  logger.info("Auditor agent: starting", { jobId: job.id });

  const repoRoot = CONTRACTS_DIR;
  const remaining = getRemainingMs(ws);
  const childMs = Math.min(remaining - 10_000, 300_000);

  // 1. Forge build
  const buildResult = await withForgeSemaphore(() =>
    forgeBuild(repoRoot, childMs),
  );
  const buildPassed = buildResult.code === 0;

  // 2. Forge test
  const testResult = await withForgeSemaphore(() =>
    forgeTest(repoRoot, childMs),
  );
  const testPassed = testResult.code === 0;

  // 3. Slither (best-effort)
  const targetPath =
    job.context.targetPath
      ? `${repoRoot}/${job.context.targetPath}`
      : repoRoot;

  const slither = await runSlither(
    targetPath,
    repoRoot,
    Math.min(getRemainingMs(ws), 300_000),
  );

  // 4. Risk score heuristic
  const riskScore = Math.min(
    100,
    slither.highFindings * 30 +
    slither.mediumFindings * 10 +
    slither.lowFindings * 2,
  );

  // 5. Go/No-Go
  const blockers: string[] = [];
  if (!buildPassed) blockers.push("forge build failed");
  if (!testPassed) blockers.push("forge test failed");
  if (slither.highFindings > 0 && !job.context.governorApprovalRef) {
    blockers.push(`Slither: ${slither.highFindings} HIGH findings require Governor waiver`);
  }

  // 6. Collect file hashes
  const solFiles = await findSolFiles(repoRoot, 20_000);
  const touchedFiles: TouchedFile[] = [];
  for (const f of solFiles.slice(0, 20)) {
    try {
      const sha = await hashFile(f);
      touchedFiles.push({ path: f, sha256After: sha, action: "read" });
    } catch { /* non-fatal */ }
  }

  const success = blockers.length === 0;

  logger.info("Auditor agent: done", {
    jobId: job.id,
    success,
    riskScore,
    highFindings: slither.highFindings,
    blockers,
  });

  return {
    success,
    summary: success
      ? `Audit PASSED — risk=${riskScore}/100, 0 blockers`
      : `Audit FAILED — blockers: ${blockers.join("; ")}`,
    buildPassed,
    testPassed,
    slitherHighFindings: slither.highFindings,
    riskScore,
    artifacts: {
      compileLogs: (buildResult.stdout + buildResult.stderr).slice(0, 32_768),
      testLogs: (testResult.stdout + testResult.stderr).slice(0, 32_768),
      auditLogs: slither.rawOutput.slice(0, 32_768),
    },
  };
}
