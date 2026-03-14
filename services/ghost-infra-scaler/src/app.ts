/**
 * Ghost Infra Scaler — Fastify App (port 7982)
 */
import Fastify from "fastify";
import {
  getPendingDecisions,
  getAllDecisions,
  runHealthAnalysis,
} from "./healthMonitor.js";
import { executePending, executeDecision } from "./scaler.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: "ghost-infra-scaler",
    version: "1.0.0",
    port: 7982,
    pendingDecisions: getPendingDecisions().length,
    totalDecisions: getAllDecisions().length,
    autoExecute: process.env.SCALER_AUTO_EXECUTE === "true",
    timestamp: Date.now(),
  }));

  app.get("/status", async () => ({
    pending: getPendingDecisions(),
    autoExecute: process.env.SCALER_AUTO_EXECUTE === "true",
  }));

  app.post("/analyze", async () => {
    const newDecisions = await runHealthAnalysis();
    return { ok: true, newDecisions: newDecisions.length, decisions: newDecisions };
  });

  app.post<{ Querystring: { dryRun?: string } }>("/execute", async (req) => {
    const dryRun = req.query.dryRun !== "false";
    const result = await executePending(dryRun);
    return { ok: true, dryRun, ...result };
  });

  app.post<{ Params: { id: string }; Querystring: { dryRun?: string } }>(
    "/execute/:id",
    async (req, reply) => {
      const all = getAllDecisions();
      const decision = all.find((d) => d.id === req.params.id);
      if (!decision) return reply.status(404).send({ error: "Decision not found" });
      const dryRun = req.query.dryRun !== "false";
      const result = await executeDecision(decision, dryRun);
      return { ok: result.ok, dryRun: result.dryRun, dispatched: result.dispatched };
    }
  );

  app.get("/history", async () => getAllDecisions());

  return app;
}
