import Fastify from "fastify";
import { DeployRequestSchema } from "./types.js";
import {
  runDeployment,
  getDeployment,
  getAllDeployments,
  listArtifacts,
} from "./deployer.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/health", async (_req, reply) => {
    return reply.send({ service: "ghost-deployer", status: "ok" });
  });

  // ── Artifacts ────────────────────────────────────────────────────────────
  app.get("/artifacts", async (_req, reply) => {
    const artifacts = await listArtifacts();
    return reply.send({
      count: artifacts.length,
      artifacts: artifacts.map(a => ({ name: a.name, path: a.path, abiLength: a.abi.length })),
    });
  });

  // ── Submit deployment ─────────────────────────────────────────────────────
  app.post("/deploy", async (req, reply) => {
    const parsed = DeployRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }
    const deployment = await runDeployment(parsed.data);
    return reply.status(202).send(deployment);
  });

  // ── Deployment status ─────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/deploy/:id", async (req, reply) => {
    const d = getDeployment(req.params.id);
    if (!d) return reply.status(404).send({ error: "deployment not found" });
    return reply.send(d);
  });

  // ── List deployments ──────────────────────────────────────────────────────
  app.get("/deployments", async (_req, reply) => {
    return reply.send({ deployments: getAllDeployments() });
  });

  return app;
}
