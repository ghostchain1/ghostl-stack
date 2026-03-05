/**
 * GhostBrain Core — GSA control routes
 *
 * Allows the brain (and authorised callers) to trigger GSA pipeline steps
 * without talking to ghostbrain-gsa directly.  ghostbrain-core fans out to
 * GSA, validates routing law on plans/patches, and returns the result.
 *
 * POST /api/v1/gsa/scan          — trigger GSA read-only scan
 * POST /api/v1/gsa/plan          — trigger GSA plan generation
 * POST /api/v1/gsa/verify        — trigger GSA verify (tests + audit)
 * POST /api/v1/gsa/apply         — forward an apply command (requires APPLY_ENABLED)
 * POST /api/v1/gsa/command       — send an arbitrary typed command to GSA
 * GET  /api/v1/gsa/status        — proxy GSA /status
 *
 * Auth: controlled by the hmacAuthPlugin registered in app.ts.
 *
 * Routing law: any plan/patch payload that includes sourceLayer/targetLayer
 * is validated here before forwarding to GSA.
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";
import { getGsaClient }         from "../agents/gsaClient.js";
import { enforceRoutingLaw }    from "../core/routingLaw.js";
import { evaluatePlan, PlanRequestSchema } from "../core/policyEngine.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const ApplySchema = z.object({
  step:   z.unknown(),
  bundle: z.unknown(),
  // Optional routing context — validated before forwarding
  meta: z.object({
    sourceLayer: z.string().optional(),
    targetLayer: z.string().optional(),
    intent:      z.string().optional(),
  }).optional(),
});

const CommandSchema = z.object({
  type:          z.string().min(1),
  correlationId: z.string().min(8),
  payload:       z.unknown().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function routingCheck(meta?: {
  sourceLayer?: string;
  targetLayer?: string;
  intent?: string;
}) {
  if (!meta?.sourceLayer || !meta?.targetLayer) return null;
  return enforceRoutingLaw({
    sourceLayer: meta.sourceLayer as "L1" | "L2" | "L3",
    targetLayer: meta.targetLayer as "L1" | "L2" | "L3" | "EXTERNAL",
    intent:      (meta.intent ?? "TX") as "TX" | "BRIDGE" | "READ" | "ADMIN",
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function gsaRoutes(app: FastifyInstance): Promise<void> {

  const gsa = getGsaClient();

  /**
   * GET /api/v1/gsa/status
   * Proxy to GSA /status — shows agent health + last scan time.
   */
  app.get("/api/v1/gsa/status", async (_req, reply) => {
    try {
      const result = await gsa.status();
      return reply.code(result.ok ? 200 : 502).send(result);
    } catch (err) {
      return reply.code(502).send({ ok: false, error: (err as Error).message });
    }
  });

  /**
   * POST /api/v1/gsa/scan
   * Trigger a full read-only GSA scan.  Returns the scan summary.
   */
  app.post("/api/v1/gsa/scan", async (req, reply) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await gsa.scan(body);
      app.log.info({ correlationId: result.correlationId, ok: result.ok }, "GSA scan triggered");
      return reply.code(result.ok ? 200 : 502).send(result);
    } catch (err) {
      return reply.code(502).send({ ok: false, error: (err as Error).message });
    }
  });

  /**
   * POST /api/v1/gsa/plan
   * Generate a patch plan from the last GSA scan.
   * Policy evaluated here so the brain can veto before forwarding.
   */
  app.post("/api/v1/gsa/plan", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Optional: validate the plan request through policy engine first
    const planParsed = PlanRequestSchema.safeParse(body);
    if (planParsed.success) {
      const decision = evaluatePlan(planParsed.data);
      if (!decision.ok) {
        return reply.code(403).send({ ok: false, error: "policy_denied", deny: decision.deny });
      }
    }

    try {
      const result = await gsa.plan(body);
      app.log.info({ planId: result.planId, ok: result.ok }, "GSA plan triggered");
      return reply.code(result.ok ? 200 : 502).send(result);
    } catch (err) {
      return reply.code(502).send({ ok: false, error: (err as Error).message });
    }
  });

  /**
   * POST /api/v1/gsa/verify
   * Trigger GSA verify (test + audit regression).
   */
  app.post("/api/v1/gsa/verify", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const result = await gsa.verify(body);
      return reply.code(result.ok ? 200 : 422).send(result);
    } catch (err) {
      return reply.code(502).send({ ok: false, error: (err as Error).message });
    }
  });

  /**
   * POST /api/v1/gsa/apply
   * Forward an apply command.
   *
   * Routing law is checked here — if the patch's meta carries cross-layer
   * routing context it MUST comply with L3→L2→L1.
   * GSA_APPLY_ENABLED must be true on the GSA side.
   */
  app.post("/api/v1/gsa/apply", async (req, reply) => {
    const parsed = ApplySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    // Routing law gate
    const rlResult = routingCheck(parsed.data.meta);
    if (rlResult && !rlResult.ok) {
      app.log.warn({ reason: rlResult.reason }, "GSA apply blocked: routing law violation");
      return reply.code(403).send({
        ok:     false,
        error:  "routing_law_violation",
        reason: rlResult.reason,
      });
    }

    try {
      const result = await gsa.apply(parsed.data.step, parsed.data.bundle);
      return reply.code(result.ok ? 200 : 403).send(result);
    } catch (err) {
      return reply.code(502).send({ ok: false, error: (err as Error).message });
    }
  });

  /**
   * POST /api/v1/gsa/command
   * Push an arbitrary typed command to the GSA agent.
   * Used for orchestration from the brain tick loop (future).
   */
  app.post("/api/v1/gsa/command", async (req, reply) => {
    const parsed = CommandSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    try {
      const result = await gsa.sendCommand({
        type:          parsed.data.type,
        correlationId: parsed.data.correlationId,
        payload:       parsed.data.payload,
      });
      return reply.code(result.ok ? 200 : 502).send(result);
    } catch (err) {
      return reply.code(502).send({ ok: false, error: (err as Error).message });
    }
  });
}
