/**
 * GhostBrain HyperCore — API Routes
 *
 * REST interface to the Layer 5 HyperCore Strategic AI.
 *
 * POST /hypercore/evaluate       — trigger a full HyperCore pipeline run now
 * GET  /hypercore/status         — loop status + aggregate metrics
 * GET  /hypercore/insights       — recent LLM Reasoner insights (?n=N)
 * GET  /hypercore/improvements   — recent DevOps AI improvements (?n=N)
 * GET  /hypercore/chain          — recent Blockchain AI strategies (?n=N)
 * GET  /hypercore/swarm          — swarm directive history + agent roster (?n=N)
 * GET  /hypercore/evolution      — evolution engine reports + stats (?n=N)
 * POST /hypercore/loop/pause     — pause the autonomous HyperCore loop
 * POST /hypercore/loop/resume    — resume the autonomous HyperCore loop
 */

import type { FastifyInstance } from "fastify";
import {
  evaluateSystem,
  getRecentEvaluations,
  pauseHyperCoreLoop,
  resumeHyperCoreLoop,
  hypercoreStats,
}                               from "../hypercore/hypercore_engine.js";
import { llmReasoner }          from "../hypercore/llm_reasoner.js";
import { devopsAI }             from "../hypercore/devops_ai.js";
import { blockchainAI }         from "../hypercore/blockchain_ai.js";
import { swarmController }      from "../hypercore/swarm_controller.js";
import { evolutionEngine }      from "../hypercore/evolution_engine.js";

// ── Routes ────────────────────────────────────────────────────────────────────

export async function hypercoreRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /hypercore/evaluate ───────────────────────────────────────────────
  // Trigger a full HyperCore pipeline evaluation synchronously.
  app.post("/hypercore/evaluate", async (_req, reply) => {
    try {
      const evaluation = await evaluateSystem();
      return {
        ok:          true,
        evaluationId: evaluation.id,
        ts:          evaluation.ts,
        durationMs:  evaluation.durationMs,
        dryRun:      evaluation.dryRun,
        summary: {
          insights:     evaluation.insights.length,
          critical:     evaluation.insights.filter(i => i.severity === "critical").length,
          improvements: evaluation.improvements.length,
          autonomous:   evaluation.improvements.filter(i => i.autonomous).length,
          strategies:   evaluation.strategies.length,
          chainCritical: evaluation.strategies.filter(s => s.status === "critical").length,
          dispatched:   evaluation.dispatched,
        },
        insights:     evaluation.insights,
        improvements: evaluation.improvements,
        strategies:   evaluation.strategies,
      };
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── GET /hypercore/status ──────────────────────────────────────────────────
  // Overall HyperCore loop status and per-module aggregate metrics.
  app.get("/hypercore/status", async () => {
    const stats = hypercoreStats();
    const recent = getRecentEvaluations(5);
    return {
      ok:         true,
      hypercore:  stats,
      recentEvaluations: recent.map(ev => ({
        id:           ev.id,
        ts:           ev.ts,
        durationMs:   ev.durationMs,
        dryRun:       ev.dryRun,
        insights:     ev.insights.length,
        improvements: ev.improvements.length,
        strategies:   ev.strategies.length,
        dispatched:   ev.dispatched,
      })),
    };
  });

  // ── GET /hypercore/insights ────────────────────────────────────────────────
  // Recent system insights from the LLM Reasoner.
  app.get<{ Querystring: { n?: string } }>("/hypercore/insights", async (req) => {
    const n = Math.min(200, Math.max(1, Number(req.query.n ?? "50")));
    return {
      ok:       true,
      count:    n,
      stats:    llmReasoner.stats(),
      insights: llmReasoner.getInsights(n),
    };
  });

  // ── GET /hypercore/improvements ────────────────────────────────────────────
  // Recent infrastructure improvement suggestions from DevOps AI.
  app.get<{ Querystring: { n?: string } }>("/hypercore/improvements", async (req) => {
    const n = Math.min(200, Math.max(1, Number(req.query.n ?? "50")));
    return {
      ok:           true,
      count:        n,
      stats:        devopsAI.stats(),
      improvements: devopsAI.getHistory(n),
    };
  });

  // ── GET /hypercore/chain ───────────────────────────────────────────────────
  // Recent Blockchain AI chain strategies.
  app.get<{ Querystring: { n?: string } }>("/hypercore/chain", async (req) => {
    const n = Math.min(200, Math.max(1, Number(req.query.n ?? "50")));
    return {
      ok:         true,
      count:      n,
      stats:      blockchainAI.stats(),
      strategies: blockchainAI.getStrategies(n),
    };
  });

  // ── GET /hypercore/swarm ───────────────────────────────────────────────────
  // Swarm directive history and live agent roster.
  app.get<{ Querystring: { n?: string } }>("/hypercore/swarm", async (req) => {
    const n = Math.min(500, Math.max(1, Number(req.query.n ?? "50")));
    return {
      ok:         true,
      count:      n,
      stats:      swarmController.stats(),
      agents:     swarmController.agentRoster(),
      directives: swarmController.getDirectives(n),
    };
  });

  // ── GET /hypercore/evolution ───────────────────────────────────────────────
  // Evolution engine reports and stats.
  app.get<{ Querystring: { n?: string } }>("/hypercore/evolution", async (req) => {
    const n = Math.min(50, Math.max(1, Number(req.query.n ?? "10")));
    return {
      ok:      true,
      count:   n,
      stats:   evolutionEngine.stats(),
      reports: evolutionEngine.getReports(n),
    };
  });

  // ── POST /hypercore/loop/pause ─────────────────────────────────────────────
  app.post("/hypercore/loop/pause", async () => {
    pauseHyperCoreLoop();
    return { ok: true, loopPaused: true };
  });

  // ── POST /hypercore/loop/resume ────────────────────────────────────────────
  app.post("/hypercore/loop/resume", async () => {
    resumeHyperCoreLoop();
    return { ok: true, loopPaused: false };
  });
}
