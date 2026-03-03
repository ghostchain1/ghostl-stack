/**
 * ACG — HTTP API Router
 *
 * REST endpoints for the Autonomous Code Guardian system.
 * Mounts under: /acg
 *
 * Routes:
 *   POST /acg/proposals          — submit a new Change Proposal
 *   GET  /acg/proposals          — list recent proposals (paginated)
 *   GET  /acg/proposals/:id      — get proposal detail + event log
 *   POST /acg/proposals/:id/retry — retry a failed/aborted proposal
 *   GET  /acg/proposals/:id/gates — get gate results for a proposal
 *   GET  /acg/status             — ACG health + active proposals count
 *
 * Auth: expects Bearer token validated by upstream proxy (ghost-jwks-guard).
 * All mutations require ACG_WRITE scope; reads require ACG_READ.
 */

import { Router, type Request, type Response, type IRouter } from "express";
import { acgPipeline } from "../acg/pipeline.js";
import type { ChangeProposalInput } from "../acg/types.js";
import { query } from "../connectors/db.js";
import { logger } from "../logger.js";

export const acgRouter: IRouter = Router();

// ─── POST /acg/proposals ──────────────────────────────────────────────────────
acgRouter.post("/proposals", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<ChangeProposalInput>;

  if (!body.goal || !body.scope || !body.triggeredBy) {
    res.status(400).json({
      error: "Missing required fields: goal, scope, triggeredBy",
    });
    return;
  }

  if (!Array.isArray(body.scope) || body.scope.length === 0) {
    res.status(400).json({ error: "scope must be a non-empty array of strings" });
    return;
  }

  const input: ChangeProposalInput = {
    goal:        body.goal,
    scope:       body.scope,
    triggeredBy: body.triggeredBy,
    ...(body.triggeredByRef !== undefined ? { triggeredByRef: String(body.triggeredByRef) } : {}),
  };

  logger.info("ACG API: proposal received", { goal: input.goal.substring(0, 80) });

  // Start pipeline asynchronously — respond immediately with proposal ID
  const proposal = await acgPipeline.run(input).catch(err => {
    logger.error("ACG API: pipeline error", { err: String(err) });
    return null;
  });

  if (!proposal) {
    res.status(500).json({ error: "Pipeline failed to start. Check logs." });
    return;
  }

  res.status(202).json({
    proposalId: proposal.proposalId,
    status: proposal.status,
    createdAt: proposal.createdAt,
    riskLevel: proposal.riskLevel,
    rolloutStrategy: proposal.rolloutStrategy,
    _links: {
      self:   `/acg/proposals/${proposal.proposalId}`,
      gates:  `/acg/proposals/${proposal.proposalId}/gates`,
      events: `/acg/proposals/${proposal.proposalId}`,
    },
  });
});

// ─── GET /acg/proposals ───────────────────────────────────────────────────────
acgRouter.get("/proposals", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<{
      proposal_id: string;
      status: string;
      goal: string;
      risk_level: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT proposal_id, status, goal, risk_level, created_at, updated_at
       FROM acg_proposals
       ORDER BY created_at DESC
       LIMIT 50`,
      [],
    );
    res.json({ proposals: result.rows });
  } catch (err) {
    logger.error("ACG API: list proposals error", { err: String(err) });
    res.status(500).json({ error: "Database error" });
  }
});

// ─── GET /acg/proposals/:id ───────────────────────────────────────────────────
acgRouter.get("/proposals/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<{ proposal_id: string; status: string; goal: string; payload: unknown }>(
      `SELECT proposal_id, status, goal, payload FROM acg_proposals WHERE proposal_id=$1`,
      [req.params["id"]],
    );
    if (!result.rows.length) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error("ACG API: get proposal error", { err: String(err) });
    res.status(500).json({ error: "Database error" });
  }
});

// ─── GET /acg/proposals/:id/gates ────────────────────────────────────────────
acgRouter.get("/proposals/:id/gates", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<{ gate_kind: string; status: string; findings: unknown; output: string; completed_at: string }>(
      `SELECT gate_kind, status, findings, output, completed_at
       FROM acg_gate_results
       WHERE proposal_id=$1
       ORDER BY completed_at ASC`,
      [req.params["id"]],
    );
    res.json({ gates: result.rows });
  } catch (err) {
    logger.error("ACG API: get gates error", { err: String(err) });
    res.status(500).json({ error: "Database error" });
  }
});

// ─── POST /acg/proposals/:id/retry ───────────────────────────────────────────
acgRouter.post("/proposals/:id/retry", async (req: Request, res: Response): Promise<void> => {
  const result = await query<{ proposal_id: string; goal: string; scope: string; triggered_by: string }>(
    `SELECT proposal_id, goal, scope, triggered_by FROM acg_proposals WHERE proposal_id=$1`,
    [req.params["id"]],
  ).catch(() => ({ rows: [] as Array<{ proposal_id: string; goal: string; scope: string; triggered_by: string }> }));

  if (!result.rows.length) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  const original = result.rows[0]!;
  const input: ChangeProposalInput = {
    goal: original.goal,
    scope: JSON.parse(original.scope as unknown as string) as string[],
    triggeredBy: original.triggered_by as ChangeProposalInput["triggeredBy"],
    triggeredByRef: original.proposal_id, // chain retry to original
  };

  logger.info("ACG API: proposal retry", { originalId: original.proposal_id });

  const proposal = await acgPipeline.run(input).catch(() => null);
  if (!proposal) {
    res.status(500).json({ error: "Retry pipeline failed" });
    return;
  }

  res.status(202).json({ proposalId: proposal.proposalId, status: proposal.status });
});

// ─── GET /acg/status ─────────────────────────────────────────────────────────
acgRouter.get("/status", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM acg_proposals GROUP BY status`,
      [],
    );
    const counts: Record<string, number> = {};
    for (const r of result.rows) counts[r.status] = parseInt(r.count, 10);

    res.json({
      service: "ghostbrain-acg",
      healthy: true,
      proposalCounts: counts,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ healthy: false, error: String(err) });
  }
});
