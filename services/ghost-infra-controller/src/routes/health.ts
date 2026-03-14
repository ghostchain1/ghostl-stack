import type { FastifyInstance } from "fastify";
import { getStatus }            from "../state.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async (_req, reply) => {
    const status = getStatus();
    const code   = status.running ? 200 : 503;
    reply.code(code).send({
      status:  status.running ? "ok" : "stopped",
      service: "ghost-infra-controller",
      uptime:  status.uptimeSeconds,
    });
  });
}
