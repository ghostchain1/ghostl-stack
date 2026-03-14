/**
 * GhostBrain Core — Benchmark + Audit Routes
 *
 * GET  /api/v1/benchmark/run          — run full scenario corpus now, return report
 * GET  /api/v1/benchmark/last         — last benchmark report (cached)
 * GET  /api/v1/benchmark/corpus       — scenario metadata (no execution)
 * GET  /api/v1/audit/history          — last N audit events from ring
 * GET  /api/v1/audit/stats            — audit counters and config
 */

import type { FastifyInstance } from "fastify";
import { runBenchmark, benchmarkStats, getScenarioCorpus } from "../benchmark/sim_benchmark.js";
import { getAuditHistory, auditStats }                     from "../audit/chain_audit.js";

export async function benchmarkRoutes(app: FastifyInstance): Promise<void> {

  /** Run the full scenario corpus synchronously and return the report. */
  app.get("/api/v1/benchmark/run", async (_req, reply) => {
    const report = runBenchmark();
    return reply.send(report);
  });

  /** Return the last cached benchmark report without re-running. */
  app.get("/api/v1/benchmark/last", async (_req, reply) => {
    const report = benchmarkStats();
    if (!report) {
      return reply.status(404).send({ error: "no_benchmark_run", detail: "Run GET /api/v1/benchmark/run first." });
    }
    return reply.send(report);
  });

  /** Return scenario corpus metadata (ids, descriptions, expected verdicts). */
  app.get("/api/v1/benchmark/corpus", async (_req, reply) => {
    return reply.send({ corpus: getScenarioCorpus(), total: getScenarioCorpus().length });
  });

  /** Return last N audit events from in-memory ring. */
  app.get("/api/v1/audit/history", async (req, reply) => {
    const q     = req.query as { limit?: string; verdict?: string };
    const limit = Math.min(parseInt(q.limit ?? "100", 10) || 100, 500);
    let history = getAuditHistory(limit);
    if (q.verdict) {
      history = history.filter(e => e.verdict === q.verdict);
    }
    return reply.send({ events: history, total: history.length });
  });

  /** Return audit subsystem counters and configuration. */
  app.get("/api/v1/audit/stats", async (_req, reply) => {
    return reply.send(auditStats());
  });
}
