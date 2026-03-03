/**
 * GhostContractAI — Workspace Sandbox
 *
 * Creates a per-job scratch state with byte/file counters and timeouts.
 * Does NOT create temp directories for contract writes (those go directly
 * to allowed roots). The workspace is a logical boundary, not a chroot.
 */

import { mkdtemp, rm } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Job, WorkspaceState } from "../types/jobs.js";
import { getAllowedRoots } from "./policy.js";
import { CONTRACTS_DIR } from "../config.js";
import { logger } from "../logger.js";

const DEFAULT_MAX_TOTAL_BYTES = 16_777_216; // 16 MB
const DEFAULT_MAX_FILES = 50;
const DEFAULT_JOB_TIMEOUT_MS = 900_000;     // 15 min

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a workspace state for a job.
 * Returns the state object + a cleanup function.
 */
export async function createWorkspace(
  job: Job,
): Promise<{ ws: WorkspaceState; cleanup: () => Promise<void> }> {
  const workDir = await mkdtemp(
    path.join(os.tmpdir(), `ghostcontract-ai-${job.id.slice(0, 8)}-`),
  );

  const ws: WorkspaceState = {
    jobId: job.id,
    workDir,
    allowedRoots: getAllowedRoots(),
    bytesRead: 0,
    bytesReadLimit:
      job.constraints.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    filesRead: 0,
    filesReadLimit: job.constraints.maxFilesRead ?? DEFAULT_MAX_FILES,
    startedAt: Date.now(),
    timeoutMs: job.constraints.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
  };

  logger.info("Workspace created", {
    jobId: job.id,
    workDir,
    bytesLimit: ws.bytesReadLimit,
    filesLimit: ws.filesReadLimit,
    timeoutMs: ws.timeoutMs,
  });

  const cleanup = async () => {
    try {
      await rm(workDir, { recursive: true, force: true });
      logger.info("Workspace cleaned up", { jobId: job.id, workDir });
    } catch (err) {
      logger.warn("Workspace cleanup failed", { jobId: job.id, err: String(err) });
    }
  };

  return { ws, cleanup };
}

// ─── Guards ───────────────────────────────────────────────────────────────────

export function assertWorkspaceNotExpired(ws: WorkspaceState): void {
  const elapsed = Date.now() - ws.startedAt;
  if (elapsed > ws.timeoutMs) {
    throw new Error(
      `Job ${ws.jobId} exceeded timeout (${elapsed}ms > ${ws.timeoutMs}ms)`,
    );
  }
}

export function getRemainingMs(ws: WorkspaceState): number {
  return Math.max(0, ws.timeoutMs - (Date.now() - ws.startedAt));
}

export function assertFileBudget(ws: WorkspaceState): void {
  if (ws.filesRead >= ws.filesReadLimit) {
    throw new Error(
      `File read limit reached (${ws.filesRead}/${ws.filesReadLimit}) for job ${ws.jobId}`,
    );
  }
}

export function assertByteBudget(ws: WorkspaceState): void {
  if (ws.bytesRead >= ws.bytesReadLimit) {
    throw new Error(
      `Byte read limit reached (${ws.bytesRead}/${ws.bytesReadLimit}) for job ${ws.jobId}`,
    );
  }
}

/**
 * Resolve a relative contract path to an absolute path.
 * Used by agents when context.targetPath is relative.
 */
export function resolveContractPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return path.normalize(relativePath);
  return path.join(CONTRACTS_DIR, relativePath);
}
