/**
 * GhostStack AI Swarm v2 — Fastify HTTP API
 * Port: SWARM_V2_PORT (default 7970)
 */

import Fastify from "fastify";
import { z }   from "zod";

import { bus }               from "./bus/messageBus.js";
import { SwarmOrchestrator } from "./orchestrator.js";
import { SubmitTaskSchema, StartWorkflowSchema } from "./types.js";
import type { BaseAgent }    from "./agents/base.js";
import type { AgentRole }    from "./types.js";

export function buildApp(
  registry: Map<AgentRole, BaseAgent>,
  orchestrator: SwarmOrchestrator
) {
  const app = Fastify({ logger: { level: process.env["LOG_LEVEL"] ?? "info" } });

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/health", async () => {
    const agents = [...registry.values()].map(a => a.getDescriptor());
    const online = agents.filter(d => d.status === "online").length;
    return {
      service:  "@ghostchain/ghost-ai-swarm-v2",
      version:  "1.0.0",
      status:   online === agents.length ? "healthy" : online > 0 ? "degraded" : "unhealthy",
      agents:   { total: agents.length, online, descriptors: agents },
      busHistory: bus.getHistory(5).length,
      ts:       new Date().toISOString(),
    };
  });

  // ── Agents ──────────────────────────────────────────────────────────────────
  app.get("/agents", async () => ({
    agents: [...registry.values()].map(a => a.getDescriptor()),
  }));

  app.get<{ Params: { role: string } }>("/agents/:role", async (req, reply) => {
    const role  = req.params.role as AgentRole;
    const agent = registry.get(role);
    if (!agent) return reply.status(404).send({ error: `Agent '${req.params.role}' not found` });
    return agent.getDescriptor();
  });

  // ── Tasks ───────────────────────────────────────────────────────────────────
  app.post("/tasks", async (req, reply) => {
    const parsed = SubmitTaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { targetRole, type, payload } = parsed.data;
    const agent = targetRole ? registry.get(targetRole) : undefined;
    if (!agent) return reply.status(404).send({ error: `Agent '${targetRole}' not registered` });

    const task: import("./types.js").SwarmTask = {
      id:         crypto.randomUUID(),
      type,
      priority:   "normal",
      targetRole,
      payload:    payload ?? {},
      createdAt:  Date.now(),
      deadline:   Date.now() + 30_000,
    };

    const result = await agent.execute(task);
    return result;
  });

  // ── Workflows ───────────────────────────────────────────────────────────────
  app.post("/workflows", async (req, reply) => {
    const parsed = StartWorkflowSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const run = await orchestrator.startWorkflow(parsed.data.type, parsed.data.payload ?? {});
    return run;
  });

  app.get("/workflows", async () => ({
    runs: orchestrator.listRuns(),
  }));

  app.get<{ Params: { id: string } }>("/workflows/:id", async (req, reply) => {
    const run = orchestrator.getRun(req.params.id);
    if (!run) return reply.status(404).send({ error: "Workflow run not found" });
    return run;
  });

  // ── Message Bus ─────────────────────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string } }>("/bus/history", async req => ({
    events: bus.getHistory(Math.min(Number(req.query.limit ?? 50), 500)),
  }));

  app.get<{ Params: { type: string }; Querystring: { limit?: string } }>(
    "/bus/events/:type",
    async req => ({
      type:   req.params.type,
      events: bus.getByType(req.params.type as never, Math.min(Number(req.query.limit ?? 20), 200)),
    })
  );

  return app;
}
