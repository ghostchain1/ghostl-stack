/**
 * GhostBrain Agent — Application Factory
 */

import Fastify from "fastify";
import { statusRoutes }  from "./routes/status.js";
import { metricsRoutes } from "./routes/metrics.js";
import { controlRoutes } from "./routes/control.js";

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

  // Content-type parser
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    try { done(null, JSON.parse(body as string)); }
    catch (e) { done(e as Error, undefined); }
  });

  app.register(statusRoutes);
  app.register(metricsRoutes);
  app.register(controlRoutes);

  return app;
}
