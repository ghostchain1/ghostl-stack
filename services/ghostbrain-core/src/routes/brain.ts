/**
 * GhostBrain Core — AI Memory + Agent Routes
 *
 * Exposes the new memory engine, telemetry, monitor, repair,
 * evolution, and agent subsystems as REST endpoints.
 *
 * Prefix: /api/v1/brain
 */

import type { FastifyInstance } from "fastify";
import { getMemoryEngineSummary, recall_similar_events } from "../memory_engine.js";
import { analyzePatterns, getCriticalPatterns, getCachedAnalyses } from "../pattern_analyzer.js";
import { getTopLearnedPatterns, getTaskLearningStats } from "../task_learning_engine.js";
import { queryMemory, haveISeenThis, whatSolvedIt, optimalRepair } from "../memory_query.js";
import { getDockerMonitorStats, getContainerFleet, getUnhealthyContainers } from "../docker_monitor.js";
import { getVMMonitorStats, getVMFleet, getUnhealthyVMs } from "../vm_monitor.js";
import { getRepairStats, executeRepair } from "../auto_repair_engine.js";
import { getEvolutionStats } from "../self_evolution_engine.js";
import { getAgentStats, getAgentNames } from "../agents/index.js";

export async function brainRoutes(app: FastifyInstance): Promise<void> {

  // ── Memory Engine ────────────────────────────────────────────────────────

  /** Memory engine summary (short-term key count + top patterns) */
  app.get("/api/v1/brain/memory/summary", async (_req, reply) => {
    return reply.send(getMemoryEngineSummary());
  });

  /** Recall similar events — POST { query, topK? } */
  app.post<{ Body: { query: string; topK?: number } }>(
    "/api/v1/brain/memory/recall",
    async (req, reply) => {
      const { query = "", topK = 5 } = req.body ?? {};
      const results = await recall_similar_events(query, topK);
      return reply.send({ results });
    },
  );

  // ── Pattern Analysis ─────────────────────────────────────────────────────

  /** Run a fresh pattern analysis pass */
  app.get("/api/v1/brain/patterns/analyze", async (_req, reply) => {
    const results = await analyzePatterns();
    return reply.send({ count: results.length, analyses: results });
  });

  /** Critical patterns from most recent analysis */
  app.get("/api/v1/brain/patterns/critical", async (_req, reply) => {
    return reply.send({ patterns: getCriticalPatterns() });
  });

  /** All cached analyses */
  app.get("/api/v1/brain/patterns/cached", async (_req, reply) => {
    return reply.send({ analyses: getCachedAnalyses() });
  });

  // ── Task Learning ────────────────────────────────────────────────────────

  /** Top learned patterns */
  app.get<{ Querystring: { limit?: string } }>(
    "/api/v1/brain/learning/patterns",
    async (req, reply) => {
      const limit = Number(req.query.limit ?? "20");
      return reply.send({ patterns: getTopLearnedPatterns(limit) });
    },
  );

  /** Task learning system statistics */
  app.get("/api/v1/brain/learning/stats", async (_req, reply) => {
    return reply.send(getTaskLearningStats());
  });

  // ── Memory Query ─────────────────────────────────────────────────────────

  /** Hybrid memory query — POST { query, options? } */
  app.post<{ Body: { query: string; options?: { topK?: number; threshold?: number } } }>(
    "/api/v1/brain/memory/query",
    async (req, reply) => {
      const { query = "", options } = req.body ?? {};
      const results = await queryMemory(query, options);
      return reply.send({ results });
    },
  );

  /** Have we seen this problem before? — POST { problem, minConfidence? } */
  app.post<{ Body: { problem: string; minConfidence?: number } }>(
    "/api/v1/brain/memory/seen",
    async (req, reply) => {
      const { problem = "", minConfidence } = req.body ?? {};
      return reply.send(await haveISeenThis(problem, minConfidence));
    },
  );

  /** What solved this problem? — POST { problem } */
  app.post<{ Body: { problem: string } }>(
    "/api/v1/brain/memory/solution",
    async (req, reply) => {
      const { problem = "" } = req.body ?? {};
      return reply.send({ solution: await whatSolvedIt(problem) });
    },
  );

  /** Optimal repair recommendation — POST { problem } */
  app.post<{ Body: { problem: string } }>(
    "/api/v1/brain/memory/repair",
    async (req, reply) => {
      const { problem = "" } = req.body ?? {};
      return reply.send(await optimalRepair(problem));
    },
  );

  // ── Docker Monitor ───────────────────────────────────────────────────────

  /** Docker monitor statistics */
  app.get("/api/v1/brain/monitor/docker/stats", async (_req, reply) => {
    return reply.send(getDockerMonitorStats());
  });

  /** Full container fleet snapshot */
  app.get("/api/v1/brain/monitor/docker/fleet", async (_req, reply) => {
    const fleet = getContainerFleet();
    return reply.send({ containers: fleet });
  });

  /** Unhealthy containers */
  app.get("/api/v1/brain/monitor/docker/unhealthy", async (_req, reply) => {
    return reply.send({ containers: getUnhealthyContainers() });
  });

  // ── VM Monitor ───────────────────────────────────────────────────────────

  /** VM monitor statistics */
  app.get("/api/v1/brain/monitor/vm/stats", async (_req, reply) => {
    return reply.send(getVMMonitorStats());
  });

  /** Full VM fleet snapshot */
  app.get("/api/v1/brain/monitor/vm/fleet", async (_req, reply) => {
    const fleet = getVMFleet();
    return reply.send({ vms: fleet });
  });

  /** Unhealthy VMs */
  app.get("/api/v1/brain/monitor/vm/unhealthy", async (_req, reply) => {
    return reply.send({ vms: getUnhealthyVMs() });
  });

  // ── Repair Engine ────────────────────────────────────────────────────────

  /** Repair engine stats (circuit breaker state) */
  app.get("/api/v1/brain/repair/stats", async (_req, reply) => {
    return reply.send(getRepairStats());
  });

  /** Execute a repair action (dryRun=true by default for safety) — POST */
  app.post<{
    Body: {
      resourceId:   string;
      layer:        "container" | "vm" | "service" | "chain";
      strategy:     string;
      params?:      Record<string, unknown>;
      triggerEvent?: string;
      rationale?:   string;
      confidence?:  number;
      dryRun?:      boolean;
    };
  }>(
    "/api/v1/brain/repair/execute",
    async (req, reply) => {
      const body    = req.body ?? {} as typeof req.body;
      const dryRun  = body.dryRun !== false;  // default true — require explicit false
      const result  = await executeRepair({
        resourceId:   body.resourceId   ?? "unknown",
        layer:        body.layer        ?? "container",
        strategy:     body.strategy     as Parameters<typeof executeRepair>[0]["strategy"] ?? "restart_container",
        params:       body.params       ?? {},
        triggerEvent: body.triggerEvent ?? "api_request",
        rationale:    body.rationale    ?? "API-initiated repair",
        confidence:   body.confidence   ?? 0.5,
        dryRun,
      });
      return reply.status(result.success ? 200 : 422).send(result);
    },
  );

  // ── Self-Evolution ───────────────────────────────────────────────────────

  /** Evolution engine stats + latest decision scores */
  app.get("/api/v1/brain/evolution/stats", async (_req, reply) => {
    return reply.send(getEvolutionStats());
  });

  // ── Agent Registry ───────────────────────────────────────────────────────

  /** List running agents */
  app.get("/api/v1/brain/agents", async (_req, reply) => {
    return reply.send({ agents: getAgentNames() });
  });

  /** Agent statistics */
  app.get("/api/v1/brain/agents/stats", async (_req, reply) => {
    return reply.send(getAgentStats());
  });
}
