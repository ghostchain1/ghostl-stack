/**
 * GhostBrain Cognitive Engine — AI API Routes
 *
 * POST /ai/think               — submit an event for a full cognitive cycle
 * GET  /ai/plan                — recent completed plans (last 20, or ?n=N)
 * GET  /ai/strategy            — strategy engine stats + top fixes
 * GET  /ai/agents              — swarm-agent registry status
 * GET  /ai/loop                — cognitive loop status
 * POST /ai/loop/pause          — pause the autonomous cognitive loop
 * POST /ai/loop/resume         — resume the autonomous cognitive loop
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";
import {
  think, getRecentPlans, cognitiveEngineStats,
  startCognitiveLoop, stopCognitiveLoop,
}                               from "../cognition/cognitive_engine.js";
import { strategyEngine }       from "../cognition/strategy_engine.js";
import { getAgentStats, getAgentNames, isAgentRunning } from "../agents/index.js";

// ── Schemas ────────────────────────────────────────────────────────────────────

const ThinkSchema = z.object({
  /** Human-readable event label, e.g. "validator_down", "container_crash" */
  event:      z.string().min(1).max(200),
  /** The affected resource ID */
  resourceId: z.string().min(1).max(200),
  /** Infrastructure layer: l1, l2, l3, container, vm, service, validator */
  layer:      z.string().min(1).max(50).default("container"),
  /** Optional extra context */
  payload:    z.record(z.any()).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

export async function aiRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /ai/think ─────────────────────────────────────────────────────────
  // Full cognitive cycle: observe → reason → plan → execute → learn
  app.post("/ai/think", async (req, reply) => {
    const parsed = ThinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { event, resourceId, layer, payload } = parsed.data;

    const result = await think({ label: event, resourceId, layer, payload });

    return {
      event:          result.event,
      reasoning: {
        classification: result.reasoning.classification,
        severity:       result.reasoning.severity,
        confidence:     result.reasoning.confidence,
        rootCause:      result.reasoning.rootCause,
        affectedLayers: result.reasoning.affectedLayers,
        rationale:      result.reasoning.rationale,
        hasFix:         result.reasoning.hasFix,
        fixSuccessRate: result.reasoning.fixSuccessRate,
      },
      plan: {
        id:          result.plan.id,
        priority:    result.plan.priority,
        steps:       result.plan.steps.map(s => ({
          index:       s.index,
          action:      s.action,
          description: s.description,
          requiresGovernance: s.requiresGovernance,
        })),
        estimatedMs: result.plan.estimatedMs,
      },
      strategy: {
        primarySource:   result.strategy.primarySource,
        overallExpected: result.strategy.overallExpected,
        steps:           result.strategy.steps.map(ss => ({
          action:          ss.step.action,
          source:          ss.source,
          expectedSuccess: ss.expectedSuccess,
          rationale:       ss.rationale,
        })),
      },
      execution: {
        planId:    result.result.planId,
        succeeded: result.result.succeeded,
        failed:    result.result.failed,
        skipped:   result.result.skipped,
        totalMs:   result.result.totalMs,
        steps:     result.result.steps.map(sr => ({
          action:    sr.step.action,
          status:    sr.status,
          detail:    sr.detail,
          error:     sr.error,
        })),
      },
      durationMs:  result.durationMs,
      ts:          new Date().toISOString(),
    };
  });

  // ── GET /ai/plan ──────────────────────────────────────────────────────────
  // Recent think() results — most recent first
  app.get<{ Querystring: { n?: string } }>("/ai/plan", async (req) => {
    const n = Math.min(100, Math.max(1, Number(req.query.n ?? "20")));
    const plans = getRecentPlans(n);
    return {
      count: plans.length,
      plans: plans.map(r => ({
        planId:         r.plan.id,
        event:          r.event.label,
        resourceId:     r.event.resourceId,
        layer:          r.event.layer,
        classification: r.reasoning.classification,
        severity:       r.reasoning.severity,
        priority:       r.plan.priority,
        stepCount:      r.plan.steps.length,
        succeeded:      r.result.succeeded,
        failed:         r.result.failed,
        skipped:        r.result.skipped,
        durationMs:     r.durationMs,
        createdAt:      new Date(r.plan.createdAt).toISOString(),
      })),
    };
  });

  // ── GET /ai/strategy ──────────────────────────────────────────────────────
  // Strategy engine stats: fix memory summary + neural graph chain count
  app.get("/ai/strategy", async () => {
    const stats = await strategyEngine.stats();
    return {
      fixMemory: {
        totalFixes:    stats.totalFixes,
        topSuccessRate: Number((stats.topFixRate * 100).toFixed(1)),
        topProblem:    stats.topFixProblem,
      },
      neuralGraph: {
        successfulChains: stats.graphChains,
      },
      ts: new Date().toISOString(),
    };
  });

  // ── GET /ai/agents ────────────────────────────────────────────────────────
  // Swarm agent registry: which agents are active and their stats
  app.get("/ai/agents", () => {
    const agentNames  = getAgentNames();
    const agentStats  = getAgentStats();
    const KNOWN_AGENTS = [
      "GhostRepairBot",
      "GhostLoadBalancer",
      "GhostOptimizer",
      "GhostPredictor",
      "GhostSecurityGuardian",
    ];

    return {
      total:   agentNames.length,
      active:  KNOWN_AGENTS.map(name => ({
        name,
        running: isAgentRunning(name),
        stats:   agentStats[name] ?? null,
      })),
      allActive: agentNames,
      ts: new Date().toISOString(),
    };
  });

  // ── GET /ai/loop ──────────────────────────────────────────────────────────
  // Cognitive loop status and counters
  app.get("/ai/loop", () => {
    const stats = cognitiveEngineStats();
    return {
      running:        stats.running,
      loopIntervalMs: stats.loopMs,
      ticks:          stats.ticks,
      totalDecisions: stats.totalDecisions,
      successRate:    stats.successRate !== null
        ? Number((stats.successRate * 100).toFixed(2))
        : null,
      recentPlanCount: stats.recentPlans,
      ts:             new Date().toISOString(),
    };
  });

  // ── POST /ai/loop/pause ───────────────────────────────────────────────────
  app.post("/ai/loop/pause", (_req, reply) => {
    stopCognitiveLoop();
    reply.code(200).send({ ok: true, message: "Cognitive loop paused" });
  });

  // ── POST /ai/loop/resume ──────────────────────────────────────────────────
  app.post("/ai/loop/resume", async (_req, reply) => {
    const stats = cognitiveEngineStats();
    if (stats.running) {
      return reply.code(200).send({ ok: true, message: "Loop already running" });
    }
    startCognitiveLoop();
    return reply.code(200).send({ ok: true, message: "Cognitive loop resumed" });
  });
}
