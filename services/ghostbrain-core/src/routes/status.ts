/**
 * GhostBrain Core — Status route
 */

import type { FastifyInstance } from "fastify";

const START_TIME = Date.now();

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => ({
    status: "ok",
    ts:     new Date().toISOString(),
  }));

  app.get("/status", async () => ({
    service: "ghostbrain-core",
    version: "0.1.0",
    uptime:  process.uptime(),
    startedAt: new Date(START_TIME).toISOString(),
  }));
}
