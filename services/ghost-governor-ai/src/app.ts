import Fastify from "fastify";
import { healthRoute }  from "./routes/health.js";
import { statusRoutes } from "./routes/status.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  healthRoute(app);
  statusRoutes(app);

  return app;
}
