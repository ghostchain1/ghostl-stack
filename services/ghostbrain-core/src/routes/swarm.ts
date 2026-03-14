/**
 * GhostBrain Autonomous Swarm — HTTP Routes
 *
 * GET  /api/v1/swarm/status         — engine status, agent list, counters
 * GET  /api/v1/swarm/results?n=N    — last N task results (max 100, default 20)
 * POST /api/v1/swarm/dispatch       — ad-hoc task dispatch (dryRun=true by default)
 * POST /api/v1/swarm/loop/pause     — pause the swarm coordination loop
 * POST /api/v1/swarm/loop/resume    — resume the swarm coordination loop
 */

import type { FastifyInstance } from "fastify";
import { randomUUID }            from "node:crypto";
import {
  swarmEngineStats,
  getRecentSwarmResults,
  pauseSwarmEngine,
  resumeSwarmEngine,
}                                from "../swarm/swarm_engine.js";
import { dispatchTask }          from "../swarm/swarm_controller.js";
import { routeRaw }              from "../swarm/task_router.js";
import type { SwarmTask, SwarmDomain } from "../swarm/swarm_types.js";

export async function swarmRoutes(app: FastifyInstance): Promise<void> {

  /** Swarm engine status + agent roster */
  app.get("/api/v1/swarm/status", async (_req, reply) => {
    return reply.send(swarmEngineStats());
  });

  /** Last N task results from the ring buffer */
  app.get("/api/v1/swarm/results", async (req, reply) => {
    const q = req.query as { n?: string };
    const n = q.n ? Math.min(Number(q.n), 100) : 20;
    const results = getRecentSwarmResults(n);
    return reply.send({ results, count: results.length });
  });

  /**
   * Ad-hoc task dispatch.
   * Body: { type, domain, data?, dryRun? }
   * API-initiated tasks default to dryRun=true for safety.
   */
  app.post("/api/v1/swarm/dispatch", async (req, reply) => {
    const body = req.body as {
      type?:    string;
      domain?:  string;
      data?:    Record<string, unknown>;
      dryRun?:  boolean;
    };

    if (!body?.type) {
      return reply.status(400).send({ error: "type is required" });
    }

    // Use routeRaw to infer domain when not supplied, then apply any overrides
    const task: SwarmTask = {
      ...routeRaw(body.type, String(body.data?.resourceId ?? "api"), body.data ?? {}),
      id:          randomUUID(),
      requestedBy: "api",
      // Caller may supply explicit domain; routing inference is the fallback
      domain:      (body.domain as SwarmDomain | undefined) ?? routeRaw(body.type, "").domain,
      dryRun:      body.dryRun ?? true,
    };

    const result = await dispatchTask(task);
    return reply.send({ task, result });
  });

  /** Pause the autonomous swarm loop */
  app.post("/api/v1/swarm/loop/pause", async (_req, reply) => {
    pauseSwarmEngine();
    return reply.send({ ok: true, action: "paused" });
  });

  /** Resume the autonomous swarm loop */
  app.post("/api/v1/swarm/loop/resume", async (_req, reply) => {
    resumeSwarmEngine();
    return reply.send({ ok: true, action: "resumed" });
  });
}
