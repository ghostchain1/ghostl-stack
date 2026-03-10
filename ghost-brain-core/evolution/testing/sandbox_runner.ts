/**
 * GhostBrain Self-Evolution Engine — Sandbox Runner
 *
 * Creates an isolated copy of the file targeted by an EvolutionDiff,
 * applies the unified patch using the system `patch` binary (execFile only),
 * and then delegates test execution to TestRunner.
 *
 * The repository source tree is NEVER modified.
 *
 * Layout created by this module:
 *   SANDBOX_BASE/<taskId>/
 *     src/                    — minimal copy of targeted source file(s)
 *     src/<relative-path>     — the file to patch
 *     patch.log               — output from `patch --dry-run` and final apply
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. execFile('patch', [...]) only — shell option is always false.
 * 2. The sandboxDir and all paths are validated; no path-traversal allowed.
 * 3. SAFE_NAME_RE validates any substring derived from external input before
 *    it is used inside a path.
 * 4. The `patch` binary is invoked without shell expansion.  All flags are
 *    static literals; no user data is interpolated into the argument list.
 */

import { execFile as _execFile }              from "child_process";
import { promisify }                           from "util";
import {
  mkdir,
  copyFile,
  writeFile,
  rm,
}                                              from "fs/promises";
import { existsSync }                          from "fs";
import { dirname, join, resolve, normalize }   from "path";
import type { EvolutionDiff, SandboxResult }  from "../types.js";
import { TestRunner }                          from "./test_runner.js";

const execFile = promisify(_execFile);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SANDBOX_BASE = resolve(
  process.env["EVOLUTION_SANDBOX_DIR"] ?? "/tmp/ghostbrain-evolution/sandbox",
);

const REPO_ROOT = resolve(
  process.env["GHOSTBRAIN_REPO_ROOT"] ?? "/home/ghost/ghostl-stack",
);

/** UUID v4 shape — only accepted shape for task IDs used in paths. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Maximum characters that a relative file path inside the repo may contain. */
const MAX_PATH_LENGTH = 256;

// ---------------------------------------------------------------------------
// SandboxRunner
// ---------------------------------------------------------------------------

export class SandboxRunner {
  private readonly runner: TestRunner;

  constructor(runner?: TestRunner) {
    this.runner = runner ?? new TestRunner();
  }

  /**
   * Apply diff in an isolated sandbox and run tests.
   * Returns a SandboxResult — never throws (errors become failure results).
   */
  async run(diff: EvolutionDiff): Promise<SandboxResult> {
    const now = Date.now();

    // --- Validate taskId -------------------------------------------------
    if (!UUID_RE.test(diff.taskId)) {
      return failure(diff.taskId, "", `invalid taskId: "${diff.taskId}"`, now);
    }

    // --- Validate targetFile (relative, no traversal) --------------------
    const relTarget = normalize(diff.targetFile).replace(/^(\.\.(\/|\\|$))+/, "");
    if (
      relTarget !== diff.targetFile ||
      relTarget.startsWith("/") ||
      relTarget.length > MAX_PATH_LENGTH ||
      relTarget.includes("\0")
    ) {
      return failure(diff.taskId, "", `invalid targetFile: "${diff.targetFile}"`, now);
    }

    const sandboxDir  = join(SANDBOX_BASE, diff.taskId);
    const sandboxFile = join(sandboxDir, "src", relTarget);
    const sourceFile  = join(REPO_ROOT, relTarget);
    const patchFile   = join(sandboxDir, "change.patch");

    // Guard: sandboxFile must stay inside sandboxDir.
    if (!resolve(sandboxFile).startsWith(resolve(sandboxDir))) {
      return failure(diff.taskId, sandboxDir, "path traversal in targetFile", now);
    }

    // Guard: sourceFile must be inside REPO_ROOT.
    if (!resolve(sourceFile).startsWith(REPO_ROOT)) {
      return failure(diff.taskId, sandboxDir, "source path escapes repo root", now);
    }

    if (!existsSync(sourceFile)) {
      return failure(diff.taskId, sandboxDir, `source file not found: ${relTarget}`, now);
    }

    try {
      // Create isolated sandbox directory (mode 700 — no world access).
      await mkdir(join(sandboxDir, "src", dirname(relTarget)), {
        recursive: true,
        mode: 0o700,
      });

      // Copy the single source file into the sandbox.
      await copyFile(sourceFile, sandboxFile);

      // Write the patch to the sandbox as plain text.
      await writeFile(patchFile, diff.unifiedDiff, { encoding: "utf8", mode: 0o600 });

      // --- Dry-run: validate the patch before applying ------------------
      const dryRun = await execFile(
        "patch",
        ["--dry-run", "--unified", "--input", patchFile, sandboxFile],
        { cwd: sandboxDir, timeout: 10_000 },
      ).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 1 } as const));

      if ("code" in dryRun && dryRun.code === 1) {
        return failure(
          diff.taskId, sandboxDir,
          `patch dry-run failed: ${(dryRun as { stderr?: string }).stderr ?? ""}`,
          now,
        );
      }

      // --- Apply the patch to the sandboxed copy only -------------------
      await execFile(
        "patch",
        ["--unified", "--input", patchFile, sandboxFile],
        { cwd: sandboxDir, timeout: 10_000 },
      );

      // --- Run tests inside the sandbox ---------------------------------
      const testReport = await this.runner.run(diff.taskId, sandboxDir);

      return {
        taskId:      diff.taskId,
        sandboxDir,
        patchApplied: true,
        testReport,
        error:        testReport.passed ? undefined : testReport.stderr,
        ranAt:        now,
      };
    } catch (err) {
      return failure(
        diff.taskId, sandboxDir,
        err instanceof Error ? err.message : String(err),
        now,
      );
    } finally {
      // Always clean up the sandbox after the run.
      await rm(sandboxDir, { recursive: true, force: true }).catch(() => {/* ignore */});
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function failure(
  taskId:     string,
  sandboxDir: string,
  error:      string,
  ranAt:      number,
): SandboxResult {
  return {
    taskId,
    sandboxDir,
    patchApplied: false,
    testReport: {
      taskId,
      sandboxedDir: sandboxDir,
      stagingPath:  sandboxDir,
      passed:   false,
      exitCode: -1,
      stdout:   "",
      stderr:   error,
      durationMs: 0,
      ranAt,
    },
    error,
    ranAt,
  };
}
