import type { FastifyInstance } from "fastify";

export function healthRoute(app: FastifyInstance): void {
  app.get("/healthz", async (_req, reply) => {
    await reply.send({ status: "ok", service: "ghost-governor-ai", port: 7930 });
  });
}
