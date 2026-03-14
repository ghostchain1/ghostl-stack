/**
 * health.ts — GET /healthz
 */

import type { FastifyInstance } from "fastify";

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async (_req, reply) => {
    reply.status(200).send({
      status:  "ok",
      service: "ghost-defi-architect",
      version: "0.1.0",
    });
  });
}
