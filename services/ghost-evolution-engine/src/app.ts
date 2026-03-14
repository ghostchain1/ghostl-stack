/**
 * GhostStack Evolution Engine — Fastify HTTP API
 * Port: EVOLUTION_ENGINE_PORT (default 7975)
 */

import Fastify    from "fastify";
import { scanEcosystem }              from "./scanner.js";
import { buildPlan, executePlan }     from "./planner.js";

export function buildApp() {
  const app = Fastify({ logger: { level: process.env["LOG_LEVEL"] ?? "info" } });

  app.get("/health", async () => ({
    service: "@ghostchain/ghost-evolution-engine",
    version: "1.0.0",
    status:  "ok",
    ts:      new Date().toISOString(),
  }));

  /** Trigger an immediate ecosystem scan */
  app.post("/scan", async () => {
    return scanEcosystem();
  });

  /** Build an upgrade plan (dry-run by default) */
  app.post<{ Body: { dryRun?: boolean } }>("/plan", async req => {
    const scan   = await scanEcosystem();
    const dryRun = req.body?.dryRun !== false; // safe default: dry-run=true
    return buildPlan(scan, dryRun);
  });

  /** Execute upgrade plan — only high-priority, requires dryRun=false */
  app.post<{ Body: { dryRun?: boolean } }>("/execute", async (req, reply) => {
    const dryRun = req.body?.dryRun !== false;
    if (dryRun) {
      return reply.status(200).send({
        note:     "Dry-run mode — no changes made. Pass dryRun=false to submit proposals.",
        dryRun:   true,
      });
    }
    const scan   = await scanEcosystem();
    const plan   = buildPlan(scan, false);
    const result = await executePlan(plan);
    return { plan, execution: result };
  });

  return app;
}
