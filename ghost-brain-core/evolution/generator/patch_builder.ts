/**
 * GhostBrain Self-Evolution Engine — Patch Builder
 *
 * Writes a unified diff supplied by CodeGenerator into an isolated staging
 * directory.  It NEVER touches any source file inside the repository tree.
 *
 * Staging layout:
 *   /tmp/ghostbrain-evolution/staging/<taskId>/
 *     change.patch       — the unified diff, exactly as generated
 *     metadata.json      — task kind, target file path, diffHash, timestamp
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. All writes go to EVOLUTION_STAGING_DIR (default /tmp/ghostbrain-evolution).
 *    A path-traversal guard rejects any staging path that escapes this dir.
 * 2. No shell involvement — mkdir and write are Node fs/promises only.
 * 3. The patch file is treated as plain UTF-8 text, never executed.
 * 4. taskId is validated as a UUID before use in path construction.
 */

import {
  mkdir,
  writeFile,
  rm,
} from "fs/promises";
import { existsSync } from "fs";
import { join, resolve, normalize } from "path";
import type { EvolutionDiff, StagingResult } from "../types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STAGING_BASE = resolve(
  process.env["EVOLUTION_STAGING_DIR"] ?? "/tmp/ghostbrain-evolution",
);

/** UUID v4 format — only this shape is accepted as a task ID in paths. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// PatchBuilder
// ---------------------------------------------------------------------------

export class PatchBuilder {
  private readonly stagingBase: string;

  constructor(stagingBase?: string) {
    this.stagingBase = stagingBase ?? STAGING_BASE;
  }

  /**
   * Write the unified diff to an isolated staging directory.
   * Returns a StagingResult indicating success or failure with error detail.
   *
   * This method does NOT apply the patch; that is the sandbox runner's job.
   */
  async stage(diff: EvolutionDiff): Promise<StagingResult> {
    const now = Date.now();

    // --- Validate task ID to prevent path traversal --------------------
    if (!UUID_RE.test(diff.taskId)) {
      return {
        taskId:     diff.taskId,
        stagingPath: "",
        success:    false,
        error:      `invalid taskId format: "${diff.taskId}"`,
        stagedAt:   now,
      };
    }

    const stagingPath = join(this.stagingBase, "staging", diff.taskId);

    // Guard: resolved path must be inside staging base.
    if (!resolve(stagingPath).startsWith(resolve(this.stagingBase))) {
      return {
        taskId:      diff.taskId,
        stagingPath: "",
        success:     false,
        error:       "path traversal detected — staging path escapes staging base",
        stagedAt:    now,
      };
    }

    try {
      await mkdir(stagingPath, { recursive: true, mode: 0o700 });

      // Write the patch file (plain text, not executed).
      const patchPath = join(stagingPath, "change.patch");
      await writeFile(patchPath, diff.unifiedDiff, { encoding: "utf8", mode: 0o600 });

      // Write accompanying metadata so reviewers can inspect without
      // having to decode the patch header.
      const meta = {
        taskId:     diff.taskId,
        targetFile: diff.targetFile,
        diffHash:   diff.diffHash,
        rationale:  diff.rationale,
        generatedAt: diff.generatedAt,
        stagedAt:   now,
      };
      await writeFile(
        join(stagingPath, "metadata.json"),
        JSON.stringify(meta, null, 2),
        { encoding: "utf8", mode: 0o600 },
      );

      return { taskId: diff.taskId, stagingPath, success: true, stagedAt: now };
    } catch (err) {
      return {
        taskId:      diff.taskId,
        stagingPath: "",
        success:     false,
        error:       err instanceof Error ? err.message : String(err),
        stagedAt:    now,
      };
    }
  }

  /**
   * Remove the staging directory for a task (used by rollback engine).
   * Silently succeeds if the directory does not exist.
   */
  async clean(taskId: string): Promise<void> {
    if (!UUID_RE.test(taskId)) {
      throw new Error(`invalid taskId format: "${taskId}"`);
    }

    const stagingPath = join(this.stagingBase, "staging", taskId);

    // Guard: resolved path must remain inside staging base.
    if (!resolve(stagingPath).startsWith(resolve(this.stagingBase))) {
      throw new Error("path traversal detected — refusing to remove path outside staging base");
    }

    if (!existsSync(stagingPath)) return;

    // Recursive removal of the isolated task directory only.
    await rm(stagingPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  }

  /** Absolute path for a staged task directory (does NOT create it). */
  stagingPathFor(taskId: string): string {
    return join(this.stagingBase, "staging", taskId);
  }
}
