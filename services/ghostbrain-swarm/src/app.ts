import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import {
  getRegistry,
  getAgent,
  executeTask,
} from "./swarm.js";
import { SubmitTaskSchema } from "./types.js";
import type { SwarmTask } from "./types.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // ─── Health ──────────────────────────────────────────────────────────────
  app.get("/health", async (_req, reply) => {
    const agents = getRegistry();
    const online = agents.filter(a => a.status === "online").length;
    return reply.send({
      service: "ghostbrain-swarm",
      status:  online > 0 ? "ok" : "degraded",
      agents:  { total: agents.length, online },
    });
  });

  // ─── List agents ─────────────────────────────────────────────────────────
  app.get("/agents", async (_req, reply) => {
    return reply.send({ agents: getRegistry() });
  });

  // ─── Single agent status ─────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
    const agent = getAgent(req.params.id);
    if (!agent) return reply.status(404).send({ error: "agent not found" });
    return reply.send(agent);
  });

  // ─── Submit task ─────────────────────────────────────────────────────────
  app.post("/task", async (req, reply) => {
    const parsed = SubmitTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }
    const input = parsed.data;
    const task: SwarmTask = {
      id:          randomUUID(),
      type:        input.type,
      priority:    input.priority,
      payload:     input.payload,
      targetRole:  input.targetRole,
      quorum:      input.quorum,
      createdAt:   Date.now(),
      deadline:    Date.now() + input.deadlineMs,
    };

    const result = await executeTask(task);
    const status = result.reached ? 200 : 503;
    return reply.status(status).send(result);
  });

  // ─── Swarm metrics ───────────────────────────────────────────────────────
  app.get("/metrics", async (_req, reply) => {
    const agents = getRegistry();
    return reply.send({
      agents: agents.map(a => ({
        id:        a.id,
        role:      a.role,
        status:    a.status,
        latency:   a.latency,
        taskCount: a.taskCount,
      })),
    });
  });

  return app;
}
