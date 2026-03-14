/**
 * app.ts — Fastify application factory for ghost-defi-architect.
 */

import Fastify, { type FastifyInstance } from "fastify";
import type { FastifyError } from "@fastify/error";
import { healthRoute }   from "./routes/health.js";
import { buildRoute }    from "./routes/build.js";
import { simulateRoute } from "./routes/simulate.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  // ── Global error handler ─────────────────────────────────────────────────
  app.setErrorHandler<FastifyError>((err, _req, reply) => {
    app.log.error(err);
    const statusCode = err.statusCode ?? 500;
    reply.status(statusCode).send({
      error:   err.name ?? "InternalServerError",
      message: err.message,
      statusCode,
    });
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  await app.register(healthRoute);
  await app.register(buildRoute,    { prefix: "/api/v1" });
  await app.register(simulateRoute, { prefix: "/api/v1" });

  return app;
}
