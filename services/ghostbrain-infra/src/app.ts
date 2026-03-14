/**
 * GhostBrain Infra — Application Factory
 */

import Fastify from "fastify";
import { infraRoutes } from "./routes/infra.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: process.env.NODE_ENV === "development"
        ? { target: "pino-pretty" }
        : undefined,
    },
    disableRequestLogging: process.env.NODE_ENV === "production",
  });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    try { done(null, JSON.parse(body as string)); }
    catch (e) { done(e as Error, undefined); }
  });

  app.get("/healthz", async (_req, reply) => reply.send({ ok: true }));
  app.register(infraRoutes);

  return app;
}
