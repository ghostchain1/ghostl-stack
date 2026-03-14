/**
 * GhostBrain Core — Cognition routes
 *
 * GET  /api/v1/cognition/decide/:resourceId  — autonomous decision for one resource
 * POST /api/v1/cognition/decide              — batch decision for multiple resources
 * GET  /api/v1/cognition/scan                — scan all known resources, return non-trivial decisions
 * POST /api/v1/cognition/observe             — trigger one manual observe cycle (Docker + VM + chains)
 * GET  /api/v1/cognition/metrics             — Prometheus-style metric counters
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";
import { decide, scanAll }      from "../cognition/decision_engine.js";
import { runObserveCycle, metrics } from "../infra/hypervisor_controller.js";

const BatchDecideSchema = z.object({
  resourceIds: z.array(z.string().min(1)).min(1).max(100),
  layer:       z.string().default("container"),
});

export async function cognitionRoutes(app: FastifyInstance): Promise<void> {

  // ── Single resource decision ─────────────────────────────────────────────
  app.get<{ Params: { resourceId: string }; Querystring: { layer?: string } }>(
    "/api/v1/cognition/decide/:resourceId",
    async (req) => {
      const decision = decide(req.params.resourceId, req.query.layer ?? "container");
      return { decision };
    },
  );

  // ── Batch decision ────────────────────────────────────────────────────────
  app.post("/api/v1/cognition/decide", async (req, reply) => {
    const parsed = BatchDecideSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const decisions = parsed.data.resourceIds.map(id => decide(id, parsed.data.layer));
    return { count: decisions.length, decisions };
  });

  // ── Full scan ────────────────────────────────────────────────────────────
  app.get("/api/v1/cognition/scan", async () => {
    const decisions = scanAll();
    return {
      scanned: decisions.length,
      critical: decisions.filter(d => d.riskLevel === "critical").length,
      decisions,
    };
  });

  // ── Manual observe cycle ─────────────────────────────────────────────────
  app.post("/api/v1/cognition/observe", async (_req, reply) => {
    try {
      const result = await runObserveCycle();
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  // ── Prometheus-style metrics ─────────────────────────────────────────────
  app.get("/api/v1/cognition/metrics", async () => ({
    ghostbrain_memory_entries:     metrics.memoryEntries,
    ghostbrain_infra_load:         metrics.infraLoadScore,
    ghostbrain_ai_actions_total:   metrics.aiActionsTotal,
    ghostbrain_crash_prevention:   metrics.crashPrevention,
    ghostbrain_collect_cycles:     metrics.collectCycles,
    ts:                            new Date().toISOString(),
  }));
}
