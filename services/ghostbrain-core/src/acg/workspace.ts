/**
 * ACG — Scratch Workspace Manager
 *
 * Creates and manages an isolated git working copy for every Change Proposal.
 * GhostBrain NEVER touches the main checkout directly — all mutations happen
 * in a per-proposal scratch directory that is thrown away after PR creation.
 *
 * Uses child_process (promisified exec) to shell out to git; no direct FS mutations.
 * Secrets are never logged (redacted by logger).
 */

import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../logger.js";
import {
  ACG_GITHUB_TOKEN,
  ACG_REPO_URL,
  ACG_REPO_DEFAULT_BRANCH,
} from "../config.js";

const exec = promisify(_exec);

export interface WorkspaceHandle {
  proposalId: string;
  scratchDir: string;
  branchName: string;
  /** Dispose scratch dir (call always after use, even on error). */
  dispose(): Promise<void>;
}

/**
 * Clone the repo into a temp directory and check out a fresh proposal branch.
 * Uses a token-authenticated remote; token is never logged.
 */
export async function createWorkspace(proposalId: string): Promise<WorkspaceHandle> {
  const base = tmpdir();
  const scratchDir = await mkdtemp(join(base, `acg-${proposalId.substring(0, 8)}-`));

  // Build authenticated remote URL (token never printed in logs — redacted by logger)
  const remote = ACG_REPO_URL.replace(
    "https://",
    `https://x-access-token:${ACG_GITHUB_TOKEN}@`,
  );

  const branchName = `acg/${proposalId.substring(0, 12)}`;

  logger.info("ACG workspace: cloning repo", { proposalId, scratchDir, branchName });

  // Shallow clone of default branch only — keeps it fast
  await _run(`git clone --depth=1 --branch ${ACG_REPO_DEFAULT_BRANCH} ${remote} ${scratchDir}`);

  // Configure git identity (bot user)
  await _run(`git -C ${scratchDir} config user.name "GhostBrain ACG"`);
  await _run(`git -C ${scratchDir} config user.email "acg@ghostchain.internal"`);

  // Create and check out the proposal branch
  await _run(`git -C ${scratchDir} checkout -b ${branchName}`);

  logger.info("ACG workspace ready", { proposalId, scratchDir, branchName });

  return {
    proposalId,
    scratchDir,
    branchName,
    async dispose() {
      try {
        await rm(scratchDir, { recursive: true, force: true });
        logger.info("ACG workspace disposed", { proposalId, scratchDir });
      } catch (err) {
        logger.warn("ACG workspace dispose failed (non-fatal)", { proposalId, err });
      }
    },
  };
}

/** Apply a unified diff string to the workspace. */
export async function applyPatch(ws: WorkspaceHandle, unifiedDiff: string): Promise<void> {
  const patchFile = join(ws.scratchDir, `_patch-${Date.now()}.diff`);
  await _writeFile(patchFile, unifiedDiff);
  await _run(`git -C ${ws.scratchDir} apply --index ${patchFile}`);
}

/** Run an arbitrary shell command inside the workspace directory. */
export async function runInWorkspace(
  ws: WorkspaceHandle,
  command: string,
  timeoutMs = 300_000,
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await exec(command, {
    cwd: ws.scratchDir,
    timeout: timeoutMs,
    env: {
      ...process.env,
      // Strip token from environment to avoid leaking to child processes
      GITHUB_TOKEN: "",
      GH_TOKEN: "",
    },
  });
  return { stdout, stderr };
}

/** Commit all staged changes inside the workspace. */
export async function commitWorkspace(ws: WorkspaceHandle, message: string): Promise<string> {
  await _run(`git -C ${ws.scratchDir} add -A`);
  const { stdout } = await exec(`git -C ${ws.scratchDir} commit -m ${JSON.stringify(message)}`);
  // Extract commit SHA from output
  const match = stdout.match(/\[[\w/]+ ([a-f0-9]+)\]/);
  return match?.[1] ?? "unknown";
}

/** Push the branch and return a PR creation URL hint. */
export async function pushWorkspace(ws: WorkspaceHandle): Promise<void> {
  const remote = ACG_REPO_URL.replace(
    "https://",
    `https://x-access-token:${ACG_GITHUB_TOKEN}@`,
  );
  await _run(
    `git -C ${ws.scratchDir} push ${remote} ${ws.branchName}:${ws.branchName} --force-with-lease`,
  );
  logger.info("ACG workspace pushed", { proposalId: ws.proposalId, branch: ws.branchName });
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function _run(cmd: string, timeoutMs = 60_000): Promise<void> {
  // Redact token patterns before logging
  const safeCmd = cmd.replace(/x-access-token:[^@]+@/g, "x-access-token:[REDACTED]@");
  logger.debug("ACG workspace exec", { cmd: safeCmd });
  await exec(cmd, { timeout: timeoutMs });
}

async function _writeFile(path: string, content: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, content, "utf8");
}
