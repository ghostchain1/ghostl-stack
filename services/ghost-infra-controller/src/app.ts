import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";
import { statusRoutes } from "./routes/status.js";

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(healthRoutes);
  await app.register(statusRoutes);

  return app;
}
