/**
 * GhostBrain Core — Action routes
 *
 * POST /actions/plan    — Evaluate a plan against routing law + governance policy
 * POST /actions/commit  — Commit an approved plan for execution (queued)
 * POST /actions/dispatch — Dispatch step to hyper-ghost-ai (internal, brain-token required)
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";
import { PlanRequestSchema, evaluatePlan } from "../core/policyEngine.js";
import { HyperGhostClient }     from "../agents/hyperGhostClient.js";

// ── Lazy singleton client (initialised from env on first use) ─────────────────
let _hgaClient: HyperGhostClient | null = null;

function getHGAClient(): HyperGhostClient {
  if (!_hgaClient) {
    _hgaClient = new HyperGhostClient({
      baseUrl:       process.env.HYPER_GHOST_BASE_URL      ?? "http://127.0.0.1:7741",
      brainToken:    process.env.HYPER_GHOST_BRAIN_TOKEN   ?? "",
      governorToken: process.env.HYPER_GHOST_GOVERNOR_TOKEN ?? "",
    });
  }
  return _hgaClient;
}

// ── In-memory approved plan queue (phase 1) ───────────────────────────────────
interface QueuedPlan {
  requestId:  string;
  action:     string;
  params:     Record<string, unknown>;
  approvals:  string[];
  queuedAt:   string;
  status:     "queued" | "dispatched" | "failed";
}

const planQueue: QueuedPlan[] = [];

// ── Zod: commit request ────────────────────────────────────────────────────────
const CommitRequestSchema = PlanRequestSchema.extend({
  approvalTokens: z.array(z.string()).optional(),
});

// ── Zod: dispatch request ─────────────────────────────────────────────────────
const DispatchRequestSchema = z.object({
  requestId: z.string().min(8),
  action:    z.string().min(1),
  params:    z.record(z.any()).default({}),
  role:      z.string().optional(),
});

// ── Routes ─────────────────────────────────────────────────────────────────────
export async function actionRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /actions/plan
   *
   * Evaluate a proposed action against routing law + governance policy.
   * Returns { ok, plan: { requestId, approvals } } or { ok: false, deny }.
   */
  app.post("/actions/plan", async (req, reply) => {
    const parsed = PlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const decision = evaluatePlan(parsed.data);
    if (!decision.ok) {
      return reply.code(403).send({ ok: false, deny: decision.deny });
    }

    return {
      ok:   true,
      plan: {
        requestId: parsed.data.requestId,
        action:    parsed.data.action,
        approvals: decision.approvals,
      },
    };
  });

  /**
   * POST /actions/commit
   *
   * Commit an approved plan into the execution queue.
   * Policy is re-evaluated here (defence-in-depth).
   * Returns { ok, queuePosition } or 403 on denial.
   */
  app.post("/actions/commit", async (req, reply) => {
    const parsed = CommitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const decision = evaluatePlan(parsed.data);
    if (!decision.ok) {
      return reply.code(403).send({ ok: false, deny: decision.deny });
    }

    const queued: QueuedPlan = {
      requestId: parsed.data.requestId,
      action:    parsed.data.action,
      params:    parsed.data.params,
      approvals: decision.approvals,
      queuedAt:  new Date().toISOString(),
      status:    "queued",
    };
    planQueue.push(queued);

    return { ok: true, queuePosition: planQueue.length - 1, approvals: decision.approvals };
  });

  /**
   * GET /actions/queue
   *
   * Inspect the current plan queue (read-only, no auth required in dev).
   */
  app.get("/actions/queue", async () => ({
    ok:    true,
    count: planQueue.length,
    items: planQueue.slice(-20), // last 20
  }));

  /**
   * POST /actions/dispatch
   *
   * Dispatch one queued plan step directly to hyper-ghost-ai.
   * Requires the brain token to be set on this service too (for audit).
   */
  app.post("/actions/dispatch", async (req, reply) => {
    const parsed = DispatchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const client = getHGAClient();
    const result = await client.dispatchAction({
      requestId: parsed.data.requestId,
      action:    parsed.data.action,
      params:    parsed.data.params,
      role:      parsed.data.role,
    });

    return reply.code(result.ok ? 200 : 502).send(result);
  });
}
