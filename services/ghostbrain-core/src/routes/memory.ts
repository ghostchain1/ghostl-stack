/**
 * GhostBrain Core — Memory routes
 *
 * GET  /api/v1/memory                   — aggregate stats across all memory layers
 * GET  /api/v1/memory/cognitive         — all cognitive knowledge entries
 * GET  /api/v1/memory/cognitive/:cat    — filter by category
 * GET  /api/v1/memory/infra             — infrastructure snapshot history
 * GET  /api/v1/memory/infra/:resourceId — history for one resource
 * GET  /api/v1/memory/fixes             — all known fixes, sorted by success rate
 * GET  /api/v1/memory/performance/:id   — performance history for one resource
 * POST /api/v1/memory/vector/search     — similarity search
 * POST /api/v1/memory/learn             — ingest a learn event (or batch)
 * POST /api/v1/memory/infra/snapshot    — manual infra snapshot push
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";
import { getMemoryTotals }      from "../cognition/memory_controller.js";
import {
  queryKnowledge,
  type KnowledgeCategory,
}                               from "../memory/cognitive_memory.js";
import { getInfraHistory, infraSummary } from "../memory/infrastructure_memory.js";
import { getAllFixes, lookupFix }         from "../memory/fix_memory.js";
import { getPerfHistory }                from "../memory/performance_memory.js";
import { search, vectorStats }           from "../memory/vector_memory.js";
import { learn, learnBatch }             from "../cognition/learning_engine.js";
import type { LearnEvent }               from "../cognition/learning_engine.js";

const VALID_CATEGORIES = ["crash", "attack", "allocation", "tuning", "routing", "governance"] as const;

const LearnEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("crash"),        resourceId: z.string(), reason: z.string(), layer: z.string(), meta: z.record(z.any()).optional() }),
  z.object({ type: z.literal("fix_result"),   problem: z.string(), solution: z.string(), actionType: z.string(), params: z.record(z.any()), success: z.boolean(), recoveryMs: z.number() }),
  z.object({ type: z.literal("infra_snap"),   resourceId: z.string(), layer: z.string(), cpuPct: z.number(), memPct: z.number(), diskIoPct: z.number().optional(), netMbps: z.number().optional(), restarts: z.number().optional(), healthy: z.boolean().optional(), meta: z.record(z.any()).optional() }),
  z.object({ type: z.literal("optimization"), resourceId: z.string(), optType: z.string(), before: z.record(z.number()), after: z.record(z.number()), improvement: z.number(), note: z.string().optional() }),
  z.object({ type: z.literal("attack"),       signature: z.string(), source: z.string().optional(), targetService: z.string().optional(), meta: z.record(z.any()).optional() }),
]);

const VectorSearchSchema = z.object({
  query: z.string().min(1),
  topK:  z.number().int().min(1).max(50).default(5),
  threshold: z.number().min(0).max(1).default(0.3),
});

const ManualSnapSchema = z.object({
  resourceId: z.string().min(1),
  layer:      z.enum(["hypervisor", "vm", "container", "service", "chain"]),
  cpuPct:     z.number().min(0).max(100),
  memPct:     z.number().min(0).max(100),
  diskIoPct:  z.number().min(0).max(100).default(0),
  netMbps:    z.number().min(0).default(0),
  restarts:   z.number().int().min(0).default(0),
  healthy:    z.boolean().default(true),
  meta:       z.record(z.any()).default({}),
});

export async function memoryRoutes(app: FastifyInstance): Promise<void> {

  // ── Aggregate summary ───────────────────────────────────────────────────────
  app.get("/api/v1/memory", async () => getMemoryTotals());

  // ── Cognitive ───────────────────────────────────────────────────────────────
  app.get("/api/v1/memory/cognitive", async () => ({
    entries: queryKnowledge(),
  }));

  app.get<{ Params: { cat: string } }>("/api/v1/memory/cognitive/:cat", async (req, reply) => {
    const cat = req.params.cat as KnowledgeCategory;
    if (!(VALID_CATEGORIES as readonly string[]).includes(cat))
      return reply.code(400).send({ error: "invalid_category", valid: VALID_CATEGORIES });
    return { entries: queryKnowledge(cat) };
  });

  // ── Infrastructure ──────────────────────────────────────────────────────────
  app.get("/api/v1/memory/infra", async () => ({
    summary:  infraSummary(),
    snapshot: getInfraHistory(undefined, undefined, 3_600_000),
  }));

  app.get<{ Params: { resourceId: string }; Querystring: { limitMs?: string } }>(
    "/api/v1/memory/infra/:resourceId",
    async (req) => {
      const limitMs = Number(req.query.limitMs ?? 3_600_000);
      return { history: getInfraHistory(req.params.resourceId, undefined, limitMs) };
    },
  );

  // Manual snapshot push (from external collectors)
  app.post("/api/v1/memory/infra/snapshot", async (req, reply) => {
    const parsed = ManualSnapSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const result = learn({ type: "infra_snap", ...parsed.data });
    return reply.code(201).send({ result });
  });

  // ── Fixes ───────────────────────────────────────────────────────────────────
  app.get("/api/v1/memory/fixes", async () => ({ fixes: getAllFixes() }));

  app.get<{ Params: { problem: string } }>("/api/v1/memory/fixes/:problem", async (req, reply) => {
    const fix = lookupFix(req.params.problem);
    if (!fix) return reply.code(404).send({ error: "not_found" });
    return { fix };
  });

  // ── Performance ─────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { limitMs?: string } }>(
    "/api/v1/memory/performance/:id",
    async (req) => {
      const limitMs = Number(req.query.limitMs ?? 86_400_000);
      return { history: getPerfHistory(req.params.id, limitMs) };
    },
  );

  // ── Vector search ───────────────────────────────────────────────────────────
  app.post("/api/v1/memory/vector/search", async (req, reply) => {
    const parsed = VectorSearchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const results = search(parsed.data.query, parsed.data.topK, parsed.data.threshold);
    return { query: parsed.data.query, results, stats: vectorStats() };
  });

  // ── Learn ingest ────────────────────────────────────────────────────────────
  app.post("/api/v1/memory/learn", async (req, reply) => {
    const body = req.body as unknown;
    // Support single event or batch array
    if (Array.isArray(body)) {
      const events: LearnEvent[] = [];
      const errors: unknown[]    = [];
      for (const item of body) {
        const p = LearnEventSchema.safeParse(item);
        if (p.success) events.push(p.data as LearnEvent);
        else errors.push(p.error.flatten());
      }
      const results = learnBatch(events);
      return reply.code(errors.length > 0 ? 207 : 201).send({ results, errors });
    }
    const parsed = LearnEventSchema.safeParse(body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const result = learn(parsed.data as LearnEvent);
    return reply.code(201).send({ result });
  });
}
