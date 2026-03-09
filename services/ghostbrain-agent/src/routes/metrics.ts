/**
 * GhostBrain Agent — Metrics Route
 * GET /api/v1/agent/metrics  — current node + VM + container metrics
 * GET /api/v1/agent/history  — recent local event history
 */

import type { FastifyInstance } from "fastify";
import { readNodeMetrics }      from "../node_metrics.js";
import { collectVmInfo }        from "../vm_monitor.js";
import { collectContainerInfo } from "../docker_monitor.js";
import { getLocalHistory, localStats } from "../local_memory.js";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/agent/metrics", async (_req, reply) => {
    const [nodeMetrics, vms, containers] = await Promise.all([
      readNodeMetrics(),
      collectVmInfo(),
      collectContainerInfo(),
    ]);
    return reply.send({ ok: true, node: nodeMetrics, vms, containers, collectedAt: Date.now() });
  });

  app.get("/api/v1/agent/history", async (req, reply) => {
    const limitMs = typeof (req.query as Record<string, string>).limitMs === "string"
      ? parseInt((req.query as Record<string, string>).limitMs, 10)
      : undefined;
    const events = getLocalHistory(limitMs);
    return reply.send({ ok: true, events, stats: localStats() });
  });
}
