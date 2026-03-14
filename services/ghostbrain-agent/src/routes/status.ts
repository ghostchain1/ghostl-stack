/**
 * GhostBrain Agent — Status Route
 * GET /api/v1/agent/status — liveness + readiness probe
 */

import type { FastifyInstance } from "fastify";
import { NODE_ID } from "../node_metrics.js";

let _ready = false;
export const markReady = (): void => { _ready = true; };

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/agent/status", async (_req, reply) => {
    return reply.send({
      ok:      true,
      ready:   _ready,
      service: "ghostbrain-agent",
      nodeId:  NODE_ID,
      version: "0.1.0",
      uptime:  process.uptime(),
      ts:      Date.now(),
    });
  });

  app.get("/healthz", async (_req, reply) => {
    return reply.send({ ok: true });
  });
}
