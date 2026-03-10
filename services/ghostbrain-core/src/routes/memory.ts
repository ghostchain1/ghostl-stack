/**
 * GhostBrain Core — Memory routes
 *
 * GET  /api/v1/memory                   — aggregate stats across all memory layers
 * GET  /api/v1/memory/neural            — neural memory backend connectivity + stats
 * GET  /api/v1/memory/cognitive         — all cognitive knowledge entries
 * GET  /api/v1/memory/cognitive/:cat    — filter by category
 * GET  /api/v1/memory/infra             — infrastructure snapshot history
 * GET  /api/v1/memory/infra/:resourceId — history for one resource
 * GET  /api/v1/memory/fixes             — all known fixes, sorted by success rate
 * GET  /api/v1/memory/performance/:id   — performance history for one resource
 * GET  /api/v1/memory/patterns          — learned task patterns
 * GET  /api/v1/memory/decisions         — recent AI decisions (last 50)
 * GET  /api/v1/memory/graph             — causal graph stats
 * GET  /api/v1/memory/graph/chains      — successful repair chains from graph
 * POST /api/v1/memory/graph/chain       — add a causal chain (event→cause→action→outcome)
 * GET  /api/v1/memory/audit             — recent HMAC-signed audit log
 * POST /api/v1/memory/audit/verify      — verify integrity of submitted audit entries
 * POST /api/v1/memory/compress          — trigger manual memory compression
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
import {
  graphStats, findChainsByEvent, getSuccessfulChains,
}                               from "../memory/neural_memory_graph.js";
import { recordChain }          from "../memory/neural_memory_graph.js";
import {
  getRecentAudit, auditIntegrityCheck,
}                               from "../memory/memory_audit.js";
import {
  getOptimizerStats, runCompression,
}                               from "../core/memory_optimizer.js";
import {
  isQdrantReady, qdrantStats,
}                               from "../db/qdrant_client.js";
import { isRedisReady }         from "../db/redis_client.js";
import { isPostgresReady, query } from "../db/postgres_client.js";

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

const CausalChainSchema = z.object({
  event: z.object({
    label:      z.string().min(1),
    resourceId: z.string().min(1),
    layer:      z.string().min(1),
    payload:    z.record(z.any()).optional(),
  }),
  cause: z.object({
    label:   z.string().min(1),
    payload: z.record(z.any()).optional(),
  }).optional(),
  action: z.object({
    label:   z.string().min(1),
    payload: z.record(z.any()).optional(),
  }).optional(),
  outcome: z.object({
    label:   z.string().min(1),
    success: z.boolean(),
    payload: z.record(z.any()).optional(),
  }).optional(),
  confidence: z.number().min(0).max(1).optional(),
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

  // ── Neural memory backend status ──────────────────────────────────────────
  app.get("/api/v1/memory/neural", async () => ({
    backends: {
      redis:    { ready: isRedisReady(),    role: "real_time_memory",       ttl: "300s" },
      postgres: { ready: isPostgresReady(), role: "operational_memory",     retention: "90 days" },
      qdrant:   { ready: isQdrantReady(),   role: "long_term_neural_memory", permanent: true },
    },
    qdrantCollections: await qdrantStats(),
    optimizer:         getOptimizerStats(),
  }));

  // ── Learned task patterns from PostgreSQL ─────────────────────────────────
  app.get<{ Querystring: { limit?: string; minConfidence?: string } }>(
    "/api/v1/memory/patterns",
    async (req) => {
      const limit         = Math.min(Number(req.query.limit ?? 50), 200);
      const minConfidence = Number(req.query.minConfidence ?? 0);
      const rows = await query<{
        pattern_key: string; trigger_category: string; trigger_label: string;
        recommended_action: string; confidence: number; observation_count: number;
        success_count: number; avg_recovery_ms: number; last_seen_at: string;
      }>(
        `SELECT pattern_key, trigger_category, trigger_label, recommended_action,
                confidence, observation_count, success_count, avg_recovery_ms, last_seen_at
         FROM task_patterns
         WHERE confidence >= $1
         ORDER BY confidence DESC, observation_count DESC
         LIMIT $2`,
        [minConfidence, limit],
      );
      return { patterns: rows, total: rows.length };
    },
  );

  // ── Recent AI decisions from PostgreSQL ───────────────────────────────────
  app.get<{ Querystring: { limit?: string; agent?: string } }>(
    "/api/v1/memory/decisions",
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const agent = req.query.agent;
      const rows = await query<{
        id: string; decided_at: string; agent: string; decision_type: string;
        resource_id: string; layer: string; confidence: number; outcome: string;
        policy_guard: string; requires_human: boolean;
      }>(
        `SELECT id, decided_at, agent, decision_type, resource_id,
                layer, confidence, outcome, policy_guard, requires_human
         FROM ai_decisions
         WHERE ($1::text IS NULL OR agent = $1)
         ORDER BY decided_at DESC
         LIMIT $2`,
        [agent ?? null, limit],
      );
      return { decisions: rows, total: rows.length };
    },
  );

  // ── Causal graph stats ────────────────────────────────────────────────────
  app.get("/api/v1/memory/graph", async () => graphStats());

  // ── Successful repair chains ──────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string } }>(
    "/api/v1/memory/graph/chains",
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      return { chains: await getSuccessfulChains(limit) };
    },
  );

  // ── Find chains by event label ────────────────────────────────────────────
  app.get<{ Querystring: { event?: string; limit?: string } }>(
    "/api/v1/memory/graph/search",
    async (req, reply) => {
      const label = req.query.event;
      if (!label) return reply.code(400).send({ error: "event query param required" });
      const limit = Math.min(Number(req.query.limit ?? 10), 50);
      return { chains: await findChainsByEvent(label, limit) };
    },
  );

  // ── Add a causal chain ────────────────────────────────────────────────────
  app.post("/api/v1/memory/graph/chain", async (req, reply) => {
    const parsed = CausalChainSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const ids = await recordChain(parsed.data);
    return reply.code(201).send({ nodeIds: ids, count: ids.length });
  });

  // ── Tamper-proof audit log ────────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string } }>(
    "/api/v1/memory/audit",
    async (req) => {
      const limit   = Math.min(Number(req.query.limit ?? 50), 500);
      const entries = await getRecentAudit(limit);
      const report  = auditIntegrityCheck(entries);
      return { entries, integrity: report };
    },
  );

  // ── Verify integrity of submitted audit entries ───────────────────────────
  app.post("/api/v1/memory/audit/verify", async (req, reply) => {
    const body = req.body as unknown;
    if (!Array.isArray(body)) return reply.code(400).send({ error: "expected array of audit entries" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = auditIntegrityCheck(body as any[]);
    return { integrity: report };
  });

  // ── Manual memory compression ─────────────────────────────────────────────
  app.post("/api/v1/memory/compress", async (_, reply) => {
    const result = await runCompression();
    return reply.code(200).send({ result });
  });
}
