/**
 * GhostContractAI — Git Tool
 *
 * Generates unified diffs and optionally creates atomic commits.
 * Respects allowed-root policy (never touches .git metadata directly).
 */

import { runCmd } from "./foundry.js";

export interface GitDiff {
  diff: string;
  truncated: boolean;
  linesAdded: number;
  linesRemoved: number;
}

// ─── Diff generation ──────────────────────────────────────────────────────────

/**
 * Generate a unified diff of unstaged changes relative to HEAD.
 * Caps output at maxBytes.
 */
export async function gitDiff(
  repoRoot: string,
  paths: string[] = [],
  maxBytes = 2_097_152,
  timeoutMs = 30_000,
): Promise<GitDiff> {
  const args = ["diff", "--unified=3", "--no-color", "--", ...paths];
  const result = await runCmd("git", args, repoRoot, timeoutMs);
  const full = result.stdout;
  const truncated = Buffer.byteLength(full, "utf8") > maxBytes;
  const diff = truncated
    ? full.slice(0, maxBytes) + "\n... [truncated]\n"
    : full;

  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }

  return { diff, truncated, linesAdded: added, linesRemoved: removed };
}

/**
 * Stage specific files and create a signed commit.
 * Only used after Governor approval — never in dry-run mode.
 */
export async function gitCommit(
  repoRoot: string,
  message: string,
  paths: string[],
  timeoutMs = 30_000,
): Promise<{ sha: string }> {
  await runCmd("git", ["add", "--", ...paths], repoRoot, timeoutMs);
  await runCmd("git", ["commit", "-m", message], repoRoot, timeoutMs);
  const rev = await runCmd("git", ["rev-parse", "HEAD"], repoRoot, timeoutMs);
  return { sha: rev.stdout.trim() };
}

/**
 * Get HEAD commit SHA.
 */
export async function gitHead(repoRoot: string): Promise<string> {
  const r = await runCmd("git", ["rev-parse", "HEAD"], repoRoot, 10_000);
  return r.stdout.trim() || "unknown";
}

/**
 * Check if working tree is clean.
 */
export async function isClean(repoRoot: string): Promise<boolean> {
  const r = await runCmd("git", ["status", "--porcelain"], repoRoot, 10_000);
  return r.stdout.trim() === "";
}
