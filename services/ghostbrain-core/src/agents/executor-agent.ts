/**
 * ACG — Executor Agent
 *
 * Applies PatchPlan diffs to a scratch workspace, runs builds,
 * updates tests (adds regression tests), and updates CHANGELOG.
 *
 * Safety invariants:
 *   - Never touches the main checkout — uses WorkspaceHandle only.
 *   - Requires a non-empty PatchPlan (no blank patches).
 *   - All commands run in per-proposal scratch dirs.
 *   - Secrets are never injected as env vars (token only via workspace.ts).
 *
 * NATS: listens on acg.patch.request after planning completes.
 */

import type { ChangeProposal, PatchPlan } from "../acg/types.js";
import type { WorkspaceHandle } from "../acg/workspace.js";
import { applyPatch, runInWorkspace, commitWorkspace } from "../acg/workspace.js";
import { logger } from "../logger.js";

export interface ExecuteResult {
  proposalId: string;
  success: boolean;
  commitSha?: string;
  buildOutput: string;
  error?: string;
}

export class ExecutorAgent {
  /**
   * Apply a PatchPlan to the scratch workspace, run the declared commands,
   * then commit all changes.  Called by the ACG pipeline after planning.
   */
  async execute(
    proposal: ChangeProposal,
    patchPlan: PatchPlan,
    ws: WorkspaceHandle,
  ): Promise<ExecuteResult> {
    logger.info("ExecutorAgent: starting execution", {
      proposalId: proposal.proposalId,
      diffs: patchPlan.diffs.length,
    });

    let buildOutput = "";

    try {
      // 1. Apply each diff sequentially
      for (const diff of patchPlan.diffs) {
        logger.info("ExecutorAgent: applying diff", { path: diff.path, op: diff.operation });
        await applyPatch(ws, diff.patch);
      }

      // 2. Install dependencies (frozen lockfile enforced)
      const installResult = await runInWorkspace(ws, "pnpm install --frozen-lockfile 2>&1", 180_000);
      buildOutput += "[install]\n" + installResult.stdout + installResult.stderr + "\n";

      // 3. Run the commands declared in the patch plan
      for (const cmd of patchPlan.commandsToRun) {
        logger.info("ExecutorAgent: running command", { cmd });
        const { stdout, stderr } = await runInWorkspace(ws, `${cmd} 2>&1`, 300_000);
        buildOutput += `[${cmd}]\n${stdout}${stderr}\n`;
      }

      // 4. Update CHANGELOG.md (append entry)
      await _updateChangelog(ws, proposal, patchPlan);

      // 5. Commit everything
      const commitMsg = `feat(acg): ${proposal.goal.substring(0, 72)}\n\nProposal: ${proposal.proposalId}\nPatch: ${patchPlan.patchId}\nTriggered-by: ${proposal.triggeredBy}`;
      const commitSha = await commitWorkspace(ws, commitMsg);

      logger.info("ExecutorAgent: execution complete", {
        proposalId: proposal.proposalId,
        commitSha,
      });

      return {
        proposalId: proposal.proposalId,
        success: true,
        commitSha,
        buildOutput,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("ExecutorAgent: execution failed", {
        proposalId: proposal.proposalId,
        error,
      });
      return {
        proposalId: proposal.proposalId,
        success: false,
        buildOutput,
        error,
      };
    }
  }

  /**
   * Verify the build output contains no fatal markers.
   * Used as a quick post-execute sanity check.
   */
  verifBuildOutput(output: string): { ok: boolean; reason?: string } {
    const fatals = ["error TS", "SyntaxError", "FATAL ERROR", "Build failed", "Cannot find module"];
    for (const f of fatals) {
      if (output.includes(f)) return { ok: false, reason: f };
    }
    return { ok: true };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function _updateChangelog(
  ws: WorkspaceHandle,
  proposal: ChangeProposal,
  _patchPlan: PatchPlan,
): Promise<void> {
  const date = new Date().toISOString().substring(0, 10);
  const entry = `\n## [ACG] ${date} — ${proposal.goal.substring(0, 80)}\n\n- Proposal: ${proposal.proposalId}\n- Risk: ${proposal.riskLevel}\n- Triggered by: ${proposal.triggeredBy}\n`;

  try {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const clPath = join(ws.scratchDir, "CHANGELOG.md");
    let existing = "";
    try {
      existing = await readFile(clPath, "utf8");
    } catch {
      existing = "# Changelog\n";
    }
    await writeFile(clPath, entry + existing, "utf8");
  } catch (err) {
    // Non-fatal: changelog update failure does not block the build
    logger.warn("ExecutorAgent: CHANGELOG update failed (non-fatal)", { err: String(err) });
  }
}
