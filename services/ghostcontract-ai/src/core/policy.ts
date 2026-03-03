/**
 * GhostContractAI — Policy Enforcement (constitution-locked)
 *
 * Validates job paths and actions against policy.yml.
 * This file must NEVER be modified by automated agents.
 */

import * as path from "node:path";
import { minimatch } from "minimatch";
import type { Job } from "../types/jobs.js";

// ─── Allowed roots (mirrors policy.yml — hard-coded as final backstop) ─────────

const ALLOWED_ROOTS: string[] = (
  process.env.GHOSTAI_ALLOWED_ROOTS
    ? process.env.GHOSTAI_ALLOWED_ROOTS.split(",")
    : [
        "/home/ghost/ghostl-stack/contracts",
        "/home/ghost/ghostl-stack/contracts/lib",
        "/home/ghost/ghostl-stack/contracts/src",
        "/home/ghost/ghostl-stack/contracts/test",
      ]
).map((r) => path.resolve(r));

const DENIED_GLOBS: string[] = [
  "**/.env",
  "**/.env.*",
  "**/secrets/**",
  "**/node_modules/**",
  "**/.git/**",
  "**/keystore/**",
  "**/*.pem",
  "**/*.key",
  "**/private_key*",
];

// ─── Public API ───────────────────────────────────────────────────────────────

export class PolicyViolationError extends Error {
  constructor(msg: string) {
    super(`PolicyViolation: ${msg}`);
    this.name = "PolicyViolationError";
  }
}

/**
 * Enforce all policy rules for a job before execution begins.
 * Throws PolicyViolationError if any rule is violated.
 */
export function enforcePolicy(job: Job): void {
  // 1. All target paths must be within allowed roots
  for (const p of job.targetPaths) {
    checkAllowedPath(p, ALLOWED_ROOTS);
  }

  // 2. deploy is never allowed from this service
  if (job.type === "CONTRACT_UPGRADE" && !job.context.governorApprovalRef) {
    throw new PolicyViolationError(
      "CONTRACT_UPGRADE requires governorApprovalRef in context (Governor approval not found)",
    );
  }

  // 3. Verify context paths if present
  if (job.context.targetPath) {
    const abs = path.isAbsolute(job.context.targetPath)
      ? job.context.targetPath
      : path.join(ALLOWED_ROOTS[0], job.context.targetPath);
    checkAllowedPath(abs, ALLOWED_ROOTS);
  }
}

/**
 * Check if a file path is within the allowed roots and not denied.
 * Throws PolicyViolationError on violation.
 */
export function checkAllowedPath(filePath: string, allowedRoots: string[]): void {
  const resolved = path.resolve(filePath);

  // Must be within at least one allowed root
  const allowed = allowedRoots.some((root) =>
    resolved.startsWith(path.resolve(root) + path.sep) ||
    resolved === path.resolve(root),
  );
  if (!allowed) {
    throw new PolicyViolationError(
      `Path "${resolved}" is outside allowed roots: [${allowedRoots.join(", ")}]`,
    );
  }

  // Must not match any denied glob
  for (const glob of DENIED_GLOBS) {
    if (minimatch(resolved, glob, { dot: true })) {
      throw new PolicyViolationError(
        `Path "${resolved}" matches denied glob: ${glob}`,
      );
    }
  }
}

/**
 * Returns the canonical allowed roots list.
 */
export function getAllowedRoots(): string[] {
  return [...ALLOWED_ROOTS];
}
