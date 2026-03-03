/**
 * ACG — Autonomous Code Guardian Pipeline
 *
 * The complete end-to-end pipeline for a Change Proposal.
 *
 * Flow (per the blueprint):
 *   A) Create Change Proposal from ChangeProposalInput
 *   B) Plan → Patch → Verify loop (no exceptions, automatic retry up to MAX_DEBUG_ITERS)
 *   C) Release → Observe → Auto-fix
 *
 * This class is the "Orchestrator" described in the blueprint.
 * It owns merge authority and enforces all non-negotiable laws.
 *
 * Thread safety: each proposal runs in its own async chain; state stored in Postgres.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ChangeProposal,
  ChangeProposalInput,
  ProposalStatus,
  GateCheck,
  ProposalEvent,
} from "./types.js";
import { createWorkspace } from "./workspace.js";
import { runAllGates, gatesAllPassed } from "./gate-runner.js";
import {
  PlannerAgent,
  ExecutorAgent,
  DebuggerAgent,
  AuditorAgent,
  QAAgent,
  ReleaseAgent,
  SentinelAgent,
} from "../agents/index.js";
import { query } from "../connectors/db.js";
import { publish } from "../connectors/nats.js";
import { logger } from "../logger.js";
import { ACG_SUBJECTS } from "./types.js";
import { ACG_MAX_DEBUG_ITERS } from "../config.js";

// ─── Agent singletons (stateless — safe to reuse) ─────────────────────────────
const planner  = new PlannerAgent();
const executor = new ExecutorAgent();
const debugger_ = new DebuggerAgent();
const auditor  = new AuditorAgent();
const qa       = new QAAgent();
const release  = new ReleaseAgent();
const sentinel = new SentinelAgent();

// ─── Pipeline ─────────────────────────────────────────────────────────────────
export class ACGPipeline {
  /**
   * Entry point — create + run a Change Proposal end-to-end.
   * Returns automatically after PR is created (release phase).
   * Sentinel observation is non-blocking (fires-and-forgets after deploy).
   */
  async run(input: ChangeProposalInput): Promise<ChangeProposal> {
    // ── Phase A: Create proposal ───────────────────────────────────────────
    const proposal = await this._createProposal(input);
    logger.info("ACGPipeline: proposal created", { proposalId: proposal.proposalId });
    await publish(ACG_SUBJECTS.PROPOSAL_CREATED, { proposalId: proposal.proposalId });

    // Scratch workspace — always disposed at the end
    const ws = await createWorkspace(proposal.proposalId);

    try {
      // ── Phase B: Plan → Patch → Verify loop ───────────────────────────────
      let loopPasses = 0;
      const maxPasses = ACG_MAX_DEBUG_ITERS;

      while (loopPasses < maxPasses) {
        loopPasses++;

        // 1. Plan
        await this._setStatus(proposal, "planning");
        const patchPlan = await planner.plan(
          proposal.proposalId,
          proposal.goal,
          proposal.scope,
        );
        proposal.patchPlan = patchPlan;
        proposal.riskLevel = planner.assessRisk(patchPlan.diffs, proposal.scope);
        proposal.rolloutStrategy = planner.rolloutForRisk(proposal.riskLevel);

        // 2. Execute (apply diffs + build)
        const execResult = await executor.execute(proposal, patchPlan, ws);
        if (!execResult.success) {
          this._logEvent(proposal, "execute", "error", `Executor failed: ${execResult.error}`);
          if (loopPasses < maxPasses) continue;
          await this._setStatus(proposal, "aborted");
          return proposal;
        }
        this._logEvent(proposal, "execute", "info", `Build OK — commit ${execResult.commitSha}`);

        // 3. Run all gates
        await this._setStatus(proposal, "pending-gates");
        const gateResults = await runAllGates({ proposal, workspace: ws });

        // Record gate results on proposal
        proposal.gates = gateResults.map<GateCheck>(r => ({
          kind: r.kind,
          status: r.passed ? "passed" : "failed",
          completedAt: new Date().toISOString(),
          output: r.output,
          findings: r.findings,
        }));
        await publish(ACG_SUBJECTS.GATE_RESULT, { proposalId: proposal.proposalId, gates: proposal.gates });

        if (gatesAllPassed(gateResults)) {
          // All gates green — move to release phase
          await this._setStatus(proposal, "gates-passed");
          this._logEvent(proposal, "gate:all", "info", "All gates passed ✓");
          break;
        }

        // Some gate failed — try debugger
        await this._setStatus(proposal, "gates-failed");
        const failedGate = gateResults.find(r => !r.passed);
        this._logEvent(proposal, `gate:${failedGate?.kind}`, "warn", `Gate failed: ${failedGate?.output?.substring(0, 200)}`);

        if (loopPasses < maxPasses) {
          // Run debugger to attempt auto-fix
          const debugResult = await debugger_.debug(
            proposal,
            ws,
            failedGate?.output ?? "",
            `Gate failure: ${failedGate?.kind}`,
          );
          if (!debugResult.fixed) {
            this._logEvent(proposal, "debugger", "error", debugResult.error ?? "Debugger could not fix");
            await this._setStatus(proposal, "aborted");
            return proposal;
          }
          this._logEvent(proposal, "debugger", "info", `Debugger fixed in ${debugResult.iterations} iteration(s)`);
        } else {
          // Max iterations reached — abort
          this._logEvent(proposal, "gate:all", "error", `Max iterations (${maxPasses}) reached without passing all gates`);
          await this._setStatus(proposal, "aborted");
          return proposal;
        }
      }

      // ── Phase C: Release ───────────────────────────────────────────────────
      if (proposal.status !== "gates-passed") return proposal;

      // Run full security audit (final check before PR)
      const auditResults = await auditor.audit(proposal, ws);
      if (auditor.hasBlockingFindings(auditResults)) {
        const summary = auditor.summarize(auditResults);
        this._logEvent(proposal, "gate:security", "error", `Security audit blocked release:\n${summary}`);
        await this._setStatus(proposal, "aborted");
        return proposal;
      }

      // Run QA final pass
      const testResults = await qa.runTests(proposal, ws);
      if (!qa.allPassed(testResults)) {
        const summary = qa.summarize(testResults);
        this._logEvent(proposal, "gate:test", "error", `QA final pass failed:\n${summary}`);
        await this._setStatus(proposal, "aborted");
        return proposal;
      }

      // Release: SBOM, provenance, push branch, open PR
      await this._setStatus(proposal, "executing");
      const artifact = await release.release(proposal, ws, auditResults);
      proposal.releaseArtifact = artifact;
      await this._setStatus(proposal, "completed");

      this._logEvent(proposal, "release", "info", `PR created. Artifact: ${artifact.artifactId}`);

      // Sentinel (non-blocking — fires async, does NOT block the pipeline)
      // In production: triggered by deploy event, not here directly
      void sentinel.observe(proposal).catch(err => {
        logger.warn("ACGPipeline: sentinel observation error (non-fatal)", { err: String(err) });
      });

      await publish(ACG_SUBJECTS.PROPOSAL_UPDATED, {
        proposalId: proposal.proposalId,
        status: proposal.status,
      });

      return proposal;
    } finally {
      await ws.dispose();
    }
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async _createProposal(input: ChangeProposalInput): Promise<ChangeProposal> {
    const now = new Date().toISOString();
    const proposal: ChangeProposal = {
      proposalId:          uuidv4(),
      createdAt:           now,
      updatedAt:           now,
      status:              "draft",
      goal:                input.goal,
      scope:               input.scope,
      triggeredBy:         input.triggeredBy,
      ...(input.triggeredByRef !== undefined ? { triggeredByRef: input.triggeredByRef } : {}),

      // Defaults — overwritten by planner
      riskLevel:           "low",
      rationale:           "",
      acceptanceCriteria:  [`The goal is achieved: ${input.goal.substring(0, 80)}`],
      testPlan:            ["Unit tests pass", "Integration tests pass", "No regressions"],
      securityPlan:        ["pnpm audit clean", "gitleaks clean", "semgrep clean"],
      rolloutStrategy:     "none",
      rollbackPlan:        ["Revert the PR and re-deploy the previous artifact"],

      gates:               [],
      evidenceLog:         [],
    };

    // Persist to DB (non-blocking on failure)
    try {
      await query(
        `INSERT INTO acg_proposals (proposal_id, status, goal, scope, triggered_by, triggered_by_ref, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (proposal_id) DO NOTHING`,
        [
          proposal.proposalId,
          proposal.status,
          proposal.goal,
          JSON.stringify(proposal.scope),
          proposal.triggeredBy,
          proposal.triggeredByRef ?? null,
          proposal.createdAt,
          proposal.updatedAt,
        ],
      );
    } catch (err) {
      logger.warn("ACGPipeline: could not persist proposal to DB (non-fatal)", { err: String(err) });
    }

    return proposal;
  }

  private async _setStatus(proposal: ChangeProposal, status: ProposalStatus): Promise<void> {
    proposal.status = status;
    proposal.updatedAt = new Date().toISOString();
    try {
      await query(
        `UPDATE acg_proposals SET status=$1, updated_at=$2 WHERE proposal_id=$3`,
        [status, proposal.updatedAt, proposal.proposalId],
      );
    } catch (err) {
      logger.warn("ACGPipeline: status update DB error (non-fatal)", { err: String(err) });
    }
    logger.info("ACGPipeline: status", { proposalId: proposal.proposalId, status });
  }

  private _logEvent(
    proposal: ChangeProposal,
    phase: string,
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const ev: ProposalEvent = {
      eventId:    uuidv4(),
      occurredAt: new Date().toISOString(),
      phase,
      level,
      message,
      ...(data !== undefined ? { data } : {}),
    };
    proposal.evidenceLog.push(ev);
    logger[level](`ACGPipeline [${phase}]`, { proposalId: proposal.proposalId, message });
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const acgPipeline = new ACGPipeline();
