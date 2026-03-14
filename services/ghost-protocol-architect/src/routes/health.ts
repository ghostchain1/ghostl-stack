import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/healthz", async (_req, reply) => {
    return reply.code(200).send({ ok: true, service: "ghost-protocol-architect", ts: new Date().toISOString() });
  });
}
