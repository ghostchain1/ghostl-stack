/**
 * GhostContractAI — Compiler Agent (CONTRACT_COMPILE)
 *
 * Runs forge build, collects artifact hashes, emits evidence.
 */

import type { Job, Plan, JobResult, TouchedFile } from "../types/jobs.js";
import type { WorkspaceState } from "../types/jobs.js";
import { forgeBuild, withForgeSemaphore } from "../tools/foundry.js";
import { CONTRACTS_DIR } from "../config.js";
import { getRemainingMs } from "../core/workspace.js";
import { hashFile } from "../tools/fs_stream.js";
import { findSolFiles } from "../tools/ripgrep.js";
import { logger } from "../logger.js";

export async function runCompiler(
  job: Job,
  ws: WorkspaceState,
  _plan: Plan,
): Promise<JobResult> {
  logger.info("Compiler agent: starting", { jobId: job.id });

  const repoRoot = CONTRACTS_DIR;
  const timeoutMs = getRemainingMs(ws);

  const buildResult = await withForgeSemaphore(() =>
    forgeBuild(repoRoot, Math.min(timeoutMs, 300_000)),
  );

  const buildPassed = buildResult.code === 0 && !buildResult.timedOut;
  const compileLogs = (buildResult.stdout + buildResult.stderr).slice(0, 65_536);

  // Hash all discovered sol files for the manifest
  const solFiles = await findSolFiles(repoRoot, 30_000);
  const touchedFiles: TouchedFile[] = [];
  for (const f of solFiles.slice(0, ws.filesReadLimit)) {
    try {
      const sha = await hashFile(f);
      touchedFiles.push({ path: f, sha256After: sha, action: "read" });
    } catch {
      // Non-fatal — file may have moved
    }
  }

  logger.info("Compiler agent: done", { jobId: job.id, buildPassed });

  return {
    success: buildPassed,
    summary: buildPassed
      ? `forge build passed (${solFiles.length} contracts)`
      : `forge build FAILED — see compileLogs`,
    buildPassed,
    artifacts: { compileLogs },
  };
}
