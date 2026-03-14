/**
 * GhostBrain Memory — Routes
 *
 * POST /api/v1/memory/ingest             — single-node event push (from agent)
 * POST /api/v1/memory/cluster-ingest     — cluster-wide batch push (from cluster leader)
 * POST /api/v1/memory/fix                — record a fix result
 * POST /api/v1/memory/learn              — cross-node learning event
 * POST /api/v1/memory/vector             — store a vector
 * POST /api/v1/memory/vector/search      — cosine similarity search
 * GET  /api/v1/memory/events             — query federated events
 * GET  /api/v1/memory/fixes              — global fix repository
 * GET  /api/v1/memory/patterns           — detected cross-node patterns
 * GET  /api/v1/memory/learn/patterns     — cross-node learning patterns
 * GET  /api/v1/memory/stats              — aggregate stats
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { federate, getFederatedEvents, federationStats, type FedEventType } from "../memory_federation.js";
import { storeGlobalVector, globalVectorSearch, vectorStats } from "../vector_memory.js";
import { globalLearn, getCrossNodePatterns, learningStats, type LearnCategory } from "../learning_memory.js";
import { globalRecordFix, lookupGlobalFix, getAllGlobalFixes, fixStats, type GlobalActionType } from "../fix_memory.js";
import { recordNodeEvent, detectPatterns, patternStats } from "../pattern_memory.js";

// ── Shared schemas ─────────────────────────────────────────────────────────────

const RawEventSchema = z.object({
  type:      z.string(),
  data:      z.record(z.unknown()).default({}),
  timestamp: z.number().default(() => Date.now()),
});

const IngestSchema = z.object({
  nodeId: z.string().min(1),
  events: z.array(RawEventSchema).min(1).max(500),
});

const ClusterIngestSchema = z.object({
  clusterSummary: z.record(z.unknown()).optional(),
  events: z.array(z.object({
    nodeId:    z.string().min(1),
    type:      z.string(),
    data:      z.record(z.unknown()).default({}),
    ts:        z.number().default(() => Date.now()),
  })).max(2000),
});

const FixSchema = z.object({
  nodeId:     z.string().min(1),
  problem:    z.string().min(1).max(512),
  actionType: z.enum(["restart","scale_memory","scale_cpu","reroute","throttle","alert","noop"]),
  success:    z.boolean(),
  recoveryMs: z.number().min(0).default(0),
});

const LearnSchema = z.object({
  nodeId:   z.string().min(1),
  category: z.enum(["crash","fix","overload","recovery","attack","optimization"]),
  problem:  z.string().min(1),
  solution: z.string().optional(),
  outcome:  z.enum(["success","failure","pending"]),
  data:     z.record(z.unknown()).default({}),
  ts:       z.number().default(() => Date.now()),
});

const VectorStoreSchema = z.object({
  id:      z.string().min(1),
  nodeId:  z.string().min(1),
  text:    z.string().min(1).max(4096),
  tags:    z.array(z.string()).default([]),
  storedAt: z.number().default(() => Date.now()),
});

const VectorSearchSchema = z.object({
  query:     z.string().min(1).max(512),
  topK:      z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.3),
  nodeId:    z.string().optional(),
});

// ── Routes ─────────────────────────────────────────────────────────────────────

export async function memoryRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/v1/memory/ingest
  app.post("/api/v1/memory/ingest", async (req, reply) => {
    const p = IngestSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body", detail: p.error.flatten() });
    const { nodeId, events } = p.data;
    const stored = await federate(nodeId, events.map(e => ({
      type: e.type as FedEventType,
      data: e.data as Record<string, unknown>,
      timestamp: e.timestamp,
    })));
    // Also record as node events for pattern detection
    for (const e of events) {
      recordNodeEvent({ nodeId, category: "infra", label: e.type, severity: "info", timestamp: e.timestamp });
    }
    return reply.status(207).send({ ok: true, stored });
  });

  // POST /api/v1/memory/cluster-ingest
  app.post("/api/v1/memory/cluster-ingest", async (req, reply) => {
    const p = ClusterIngestSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    let stored = 0;
    for (const ev of p.data.events) {
      stored += await federate(ev.nodeId, [{
        type: ev.type as FedEventType,
        data: ev.data as Record<string, unknown>,
        timestamp: ev.ts,
      }]);
      recordNodeEvent({ nodeId: ev.nodeId, category: "cluster", label: ev.type, severity: "info", timestamp: ev.ts });
    }
    return reply.status(207).send({ ok: true, stored });
  });

  // POST /api/v1/memory/fix
  app.post("/api/v1/memory/fix", async (req, reply) => {
    const p = FixSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const rec = await globalRecordFix(
      p.data.nodeId, p.data.problem, p.data.actionType as GlobalActionType,
      p.data.success, p.data.recoveryMs
    );
    return reply.send({ ok: true, fix: rec });
  });

  // POST /api/v1/memory/learn
  app.post("/api/v1/memory/learn", async (req, reply) => {
    const p = LearnSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const ev = await globalLearn(p.data.nodeId, {
      category: p.data.category as LearnCategory,
      problem:  p.data.problem,
      solution: p.data.solution,
      outcome:  p.data.outcome,
      data:     p.data.data as Record<string, unknown>,
      ts:       p.data.ts,
    });
    return reply.send({ ok: true, event: ev });
  });

  // POST /api/v1/memory/vector
  app.post("/api/v1/memory/vector", async (req, reply) => {
    const p = VectorStoreSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const entry = await storeGlobalVector(p.data);
    return reply.send({ ok: true, id: entry.id });
  });

  // POST /api/v1/memory/vector/search
  app.post("/api/v1/memory/vector/search", async (req, reply) => {
    const p = VectorSearchSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const results = globalVectorSearch(p.data.query, p.data.topK, p.data.threshold, p.data.nodeId);
    return reply.send({ ok: true, results });
  });

  // GET /api/v1/memory/events
  app.get("/api/v1/memory/events", async (req, reply) => {
    const q  = req.query as Record<string, string>;
    const events = getFederatedEvents(q.nodeId, q.type as FedEventType | undefined, q.limitMs ? parseInt(q.limitMs, 10) : undefined);
    return reply.send({ ok: true, events: events.slice(-500) });
  });

  // GET /api/v1/memory/fixes
  app.get("/api/v1/memory/fixes", async (req, reply) => {
    const q = req.query as Record<string, string>;
    const minRate = q.minSuccessRate ? parseFloat(q.minSuccessRate) : 0;
    if (q.problem) {
      const fix = lookupGlobalFix(q.problem);
      return reply.send({ ok: true, fix: fix ?? null });
    }
    return reply.send({ ok: true, fixes: getAllGlobalFixes(minRate) });
  });

  // GET /api/v1/memory/patterns
  app.get("/api/v1/memory/patterns", async (req, reply) => {
    const q  = req.query as Record<string, string>;
    const minConf = q.minConfidence ? parseFloat(q.minConfidence) : 0.4;
    return reply.send({ ok: true, patterns: detectPatterns(minConf), stats: patternStats() });
  });

  // GET /api/v1/memory/learn/patterns
  app.get("/api/v1/memory/learn/patterns", async (req, reply) => {
    const q = req.query as Record<string, string>;
    const patterns = getCrossNodePatterns(q.category as LearnCategory | undefined);
    return reply.send({ ok: true, patterns, stats: learningStats() });
  });

  // GET /api/v1/memory/stats
  app.get("/api/v1/memory/stats", async (_req, reply) => {
    return reply.send({
      ok:         true,
      federation: federationStats(),
      vectors:    vectorStats(),
      fixes:      fixStats(),
      learning:   learningStats(),
      patterns:   patternStats(),
      ts:         Date.now(),
    });
  });
}
