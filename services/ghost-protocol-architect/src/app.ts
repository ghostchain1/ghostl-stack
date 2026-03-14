/**
 * GhostChain Protocol Architect — Fastify application factory
 */

import Fastify from "fastify";
import { healthRoutes  } from "./routes/health.js";
import { designRoutes  } from "./routes/design.js";
import { scanRoutes    } from "./routes/scan.js";
import { generateRoutes } from "./routes/generate.js";
import { buildRoutes   } from "./routes/build.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: process.env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try { done(null, JSON.parse(body as string)); }
      catch (err: unknown) { done(err as Error); }
    },
  );

  app.register(healthRoutes);
  app.register(designRoutes);
  app.register(scanRoutes);
  app.register(generateRoutes);
  app.register(buildRoutes);

  return app;
}
