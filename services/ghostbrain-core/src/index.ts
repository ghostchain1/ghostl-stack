/**
 * GhostBrain Core — Entry Point
 *
 * Boots the GhostBrain central autonomous coordination service:
 *   1. Ensure Postgres schema
 *   2. Connect NATS
 *   3. Start Express API
 *   4. Start the autonomous brain tick loop
 *
 * Port: 7900
 * Routing law: L3→L2→L1 (enforced in policy/routing-law.ts + gatekeeper.ts)
 */

import express from "express";
import { PORT, NODE_ENV, SERVICE_NAME, VERSION } from "./config.js";
import { logger } from "./logger.js";
import { ensureSchema } from "./connectors/db.js";
import { connectNATS, disconnectNATS } from "./connectors/nats.js";
import { buildRouter } from "./api/router.js";
import { startBrain } from "./orchestrator/brain.js";
import { DependencyGraph } from "./planner/dependency-graph.js";

async function main(): Promise<void> {
  logger.info("GhostBrain Core starting", { service: SERVICE_NAME, version: VERSION, env: NODE_ENV });

  // ── Database ───────────────────────────────────────────────────────────────
  await ensureSchema();

  // ── NATS ───────────────────────────────────────────────────────────────────
  await connectNATS();

  // ── Health Graph ───────────────────────────────────────────────────────────
  const graph = DependencyGraph.buildDefault();

  // ── HTTP API ───────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use(buildRouter(graph));

  await new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      logger.info("HTTP API listening", { port: PORT });
      resolve();
    });
  });

  // ── Brain loop ─────────────────────────────────────────────────────────────
  startBrain();

  logger.info("GhostBrain Core ready");
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — shutting down");
  await disconnectNATS();
  const { closePool } = await import("./connectors/db.js");
  await closePool();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received — shutting down");
  await disconnectNATS();
  const { closePool } = await import("./connectors/db.js");
  await closePool();
  process.exit(0);
});

main().catch(err => {
  logger.error("Fatal startup error", { err: String(err) });
  process.exit(1);
});
