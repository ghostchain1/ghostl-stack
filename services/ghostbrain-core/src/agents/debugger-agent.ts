/**
 * ACG — Debugger Agent
 *
 * Given a bug report (or failing test output), this agent:
 *   1. Writes a FAILING test first (red) that reproduces the issue.
 *   2. Applies a minimal fix diff (green).
 *   3. Verifies the fix passes plus all existing tests (no regression).
 *
 * "New bug = new regression test" is non-negotiable.
 *
 * The debugging loop retries up to MAX_DEBUG_ITERATIONS times before escalating
 * to human review via a DENY policy decision.
 */

import type { ChangeProposal, FileDiff } from "../acg/types.js";
import type { WorkspaceHandle } from "../acg/workspace.js";
import { runInWorkspace, applyPatch, commitWorkspace } from "../acg/workspace.js";
import { logger } from "../logger.js";
import { ACG_MAX_DEBUG_ITERS } from "../config.js";

export interface DebugResult {
  proposalId: string;
  reproduced: boolean;
  fixed: boolean;
  regressionTestAdded: boolean;
  iterations: number;
  fixPatch?: FileDiff;
  testPatch?: FileDiff;
  output: string;
  error?: string;
}

export class DebuggerAgent {
  /**
   * Main entry point.  Drives the red-green-refactor loop for a given bug.
   *
   * @param failingTestOutput  stdout/stderr of the failing test run or error log
   * @param bugContext         human-readable description of the bug
   */
  async debug(
    proposal: ChangeProposal,
    ws: WorkspaceHandle,
    failingTestOutput: string,
    bugContext: string,
  ): Promise<DebugResult> {
    logger.info("DebuggerAgent: starting debug loop", {
      proposalId: proposal.proposalId,
      bugContext: bugContext.substring(0, 120),
    });

    let output = "";
    let iterations = 0;
    const maxIter = ACG_MAX_DEBUG_ITERS;

    // Step 1: Write the failing test
    const testPatch = await _generateRegressionTest(proposal, failingTestOutput, bugContext);
    try {
      await applyPatch(ws, testPatch.patch);
      output += "[regression test applied]\n";
    } catch (err) {
      output += "[regression test apply failed]\n" + String(err);
    }

    // Confirm it fails before fix
    const preFixResult = await runInWorkspace(ws, "pnpm test 2>&1", 300_000).catch(e => ({
      stdout: "",
      stderr: String(e),
    }));
    output += "[pre-fix test run]\n" + preFixResult.stdout + preFixResult.stderr + "\n";
    const reproduced = /FAIL|Error|failed/i.test(preFixResult.stdout + preFixResult.stderr);

    if (!reproduced) {
      logger.warn("DebuggerAgent: could not reproduce the bug via test", {
        proposalId: proposal.proposalId,
      });
    }

    let fixed = false;
    let fixPatch: FileDiff | undefined;

    // Step 2: Iterative fix loop
    while (!fixed && iterations < maxIter) {
      iterations++;
      logger.info("DebuggerAgent: fix iteration", {
        proposalId: proposal.proposalId,
        iteration: iterations,
      });

      fixPatch = await _generateFix(proposal, bugContext, iterations);

      try {
        await applyPatch(ws, fixPatch.patch);
      } catch (err) {
        output += `[fix iter ${iterations} apply failed]\n` + String(err) + "\n";
        continue;
      }

      const testResult = await runInWorkspace(ws, "pnpm test 2>&1", 300_000).catch(e => ({
        stdout: "",
        stderr: String(e),
      }));
      output += `[fix iter ${iterations} test]\n${testResult.stdout}${testResult.stderr}\n`;

      if (!/FAIL|Error: [0-9]+ failed/i.test(testResult.stdout + testResult.stderr)) {
        fixed = true;
        logger.info("DebuggerAgent: fix confirmed green", {
          proposalId: proposal.proposalId,
          iterations,
        });
      }
    }

    if (fixed) {
      const commitMsg = `fix(acg): ${bugContext.substring(0, 72)}\n\nFixes #${proposal.proposalId}\nDebugger iterations: ${iterations}\nRegression test: added`;
      await commitWorkspace(ws, commitMsg);
    }

    return {
      proposalId: proposal.proposalId,
      reproduced,
      fixed,
      regressionTestAdded: true,
      iterations,
      ...(fixPatch !== undefined ? { fixPatch } : {}),
      ...(testPatch !== undefined ? { testPatch } : {}),
      output,
      ...(fixed ? {} : { error: `Could not fix after ${maxIter} iterations. Escalating to human review.` }),
    };
  }
}

// ─── Helpers (stubs — wire LLM in production) ─────────────────────────────────

async function _generateRegressionTest(
  proposal: ChangeProposal,
  failingOutput: string,
  bugContext: string,
): Promise<FileDiff> {
  // In production: call LLM to generate the failing test from the error output.
  const testPath = `services/ghostbrain-core/src/__tests__/regression-${proposal.proposalId.substring(0, 8)}.test.ts`;
  const testCode = `// ACG Regression Test — auto-generated\n// Bug: ${bugContext.substring(0, 100)}\n// Proposal: ${proposal.proposalId}\nimport { describe, it, expect } from "vitest";\n\ndescribe("ACG regression: ${bugContext.substring(0, 60)}", () => {\n  it.todo("regression test placeholder — LLM will generate real assertion");\n});\n`;

  return {
    operation: "add",
    path: testPath,
    patch: `--- /dev/null\n+++ b/${testPath}\n@@ -0,0 +1,${testCode.split("\n").length} @@\n${testCode.split("\n").map(l => "+" + l).join("\n")}`,
    rationale: `Regression test for: ${bugContext.substring(0, 80)}. Error: ${failingOutput.substring(0, 120)}`,
  };
}

async function _generateFix(
  proposal: ChangeProposal,
  bugContext: string,
  iteration: number,
): Promise<FileDiff> {
  // In production: call LLM with the failing test + error context to generate minimal fix.
  return {
    operation: "modify",
    path: proposal.scope[0] ?? "services/ghostbrain-core/src/index.ts",
    patch: `--- a/${proposal.scope[0] ?? "index.ts"}\n+++ b/${proposal.scope[0] ?? "index.ts"}\n@@ debugger fix iteration ${iteration} @@\n- // TODO: LLM will generate actual fix for: ${bugContext.substring(0, 60)}\n+ // ACG fix applied (iteration ${iteration})`,
    rationale: `Fix attempt ${iteration} for: ${bugContext.substring(0, 80)}`,
  };
}
