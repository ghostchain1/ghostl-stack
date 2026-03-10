/**
 * GhostBrain Self-Evolution Engine — Test Runner
 *
 * Runs the repository test suite against a COPY of the source tree that
 * has been patched in an isolated sandbox directory.  It never touches the
 * live source tree.
 *
 * All subprocess invocations use execFile() with a typed argument array.
 * shell option is always false.  exec() is never used.
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. execFile() only — no exec(), no shell interpolation.
 * 2. Subprocess arguments are validated against an allowlist before use.
 * 3. Hard wall-clock timeout (default 120 s) — SIGKILL on breach.
 * 4. stdout/stderr are truncated to MAX_OUTPUT_BYTES before storing.
 * 5. cwd is the sandboxed copy, not the repository root.
 */

import { execFile as _execFile } from "child_process";
import { promisify }             from "util";
import type { TestReport }       from "../types.js";

const execFile = promisify(_execFile);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum time allowed for the full test run. */
const TEST_TIMEOUT_MS = parseInt(
  process.env["EVOLUTION_TEST_TIMEOUT_MS"] ?? "120000", 10,
);

/** Maximum bytes captured from stdout or stderr. */
const MAX_OUTPUT_BYTES = parseInt(
  process.env["EVOLUTION_MAX_OUTPUT_BYTES"] ?? String(10 * 1024), 10,
);

// ---------------------------------------------------------------------------
// Argument allowlist — only these test sub-commands are permitted.
// ---------------------------------------------------------------------------

const ALLOWED_TEST_SCRIPTS = new Set(["test", "test:foundry", "test:sovereign"]);

// ---------------------------------------------------------------------------
// TestRunner
// ---------------------------------------------------------------------------

export class TestRunner {
  /**
   * Run npm <script> inside sandboxedDir.
   *
   * @param taskId       EvolutionTask id — keyed into the TestReport.
   * @param sandboxedDir Absolute path to the sandboxed copy of the source.
   * @param script       npm script to run (allowlisted).
   */
  async run(
    taskId:       string,
    sandboxedDir: string,
    script:       string = "test",
  ): Promise<TestReport> {
    const startMs = Date.now();

    // Validate script against allowlist.
    if (!ALLOWED_TEST_SCRIPTS.has(script)) {
      const durationMs = Date.now() - startMs;
      return {
        taskId,
        sandboxedDir,
        passed:    false,
        exitCode:  -1,
        stdout:    "",
        stderr:    `disallowed test script: "${script}"`,
        durationMs,
        ranAt:     startMs,
      } satisfies TestReport;
    }

    try {
      const { stdout, stderr } = await execFile(
        "npm",
        ["run", script],
        {
          cwd:     sandboxedDir,
          timeout: TEST_TIMEOUT_MS,
          // shell MUST remain false (default) — no shell spawning.
          env: {
            ...process.env,
            // Prevent tests from touching the live network or blockchain nodes.
            GHOSTCHAIN_L1_RPC: "http://127.0.0.1:0",
            GHOSTL2_RPC:        "http://127.0.0.1:0",
            GHOSTL3_RPC:        "http://127.0.0.1:0",
            SIGNING_RELAY_URL:  "http://127.0.0.1:0",
            // Ensure test mode is set.
            NODE_ENV:           "test",
          },
        },
      );

      return {
        taskId,
        sandboxedDir,
        passed:    true,
        exitCode:  0,
        stdout:    truncate(stdout, MAX_OUTPUT_BYTES),
        stderr:    truncate(stderr, MAX_OUTPUT_BYTES),
        durationMs: Date.now() - startMs,
        ranAt:     startMs,
      } satisfies TestReport;
    } catch (err: unknown) {
      const e          = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      const exitCode   = typeof e.code === "number" ? e.code : 1;
      const rawStdout  = typeof e.stdout === "string" ? e.stdout : "";
      const rawStderr  = typeof e.stderr === "string" ? e.stderr : e.message ?? String(e);

      return {
        taskId,
        sandboxedDir,
        passed:    false,
        exitCode,
        stdout:    truncate(rawStdout, MAX_OUTPUT_BYTES),
        stderr:    truncate(rawStderr, MAX_OUTPUT_BYTES),
        durationMs: Date.now() - startMs,
        ranAt:     startMs,
      } satisfies TestReport;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  return buf.subarray(0, maxBytes).toString("utf8") + "\n[output truncated]";
}
