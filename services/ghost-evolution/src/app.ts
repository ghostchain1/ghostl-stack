import Fastify from "fastify";
import { z } from "zod";
import {
  runScan,
  getLastScan,
  generateProposal,
  getProposals,
  getProposal,
  approveProposal,
} from "./scanner.js";

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
    const last = getLastScan();
    return reply.send({
      service:     "ghost-evolution",
      status:      "ok",
      lastScan:    last?.scannedAt ?? null,
      coverage:    last?.coveragePct ?? null,
    });
  });

  // ── Trigger scan ──────────────────────────────────────────────────────────
  app.post("/scan", async (_req, reply) => {
    const result = await runScan();
    return reply.send(result);
  });

  // ── Get last scan ─────────────────────────────────────────────────────────
  app.get("/scan", async (_req, reply) => {
    const last = getLastScan();
    if (!last) return reply.status(404).send({ error: "No scan has been run yet. POST /scan to trigger one." });
    return reply.send(last);
  });

  // ── Generate upgrade proposal ──────────────────────────────────────────────
  app.post("/proposal", async (req, reply) => {
    const schema = z.object({ featureIds: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.format() });

    const proposal = await generateProposal(parsed.data.featureIds);
    return reply.status(201).send(proposal);
  });

  // ── List proposals ────────────────────────────────────────────────────────
  app.get("/proposals", async (_req, reply) => {
    return reply.send({ proposals: getProposals() });
  });

  // ── Get proposal ──────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/proposals/:id", async (req, reply) => {
    const p = getProposal(req.params.id);
    if (!p) return reply.status(404).send({ error: "proposal not found" });
    return reply.send(p);
  });

  // ── Submit proposal for human ratification ────────────────────────────────
  app.post<{ Params: { id: string } }>("/proposals/:id/submit", async (req, reply) => {
    const ok = approveProposal(req.params.id);
    if (!ok) return reply.status(400).send({ error: "proposal not found or already submitted" });
    return reply.send({ status: "submitted", message: "Proposal submitted for human governance ratification." });
  });

  return app;
}
