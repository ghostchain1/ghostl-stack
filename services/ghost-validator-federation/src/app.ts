/**
 * Ghost Validator Federation — Fastify App (port 7981)
 */
import Fastify from "fastify";
import { z } from "zod";
import {
  ReputationUpdateSchema,
  type FederationRegion,
  FEDERATION_REGIONS,
} from "ghost-federation-sdk";
import { reputationEngine } from "./reputationEngine.js";
import { getPendingRecommendations, analyzeAndRecommend, scanAllAtRisk } from "./slashingRecommender.js";

const OnboardSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  region: z.enum([...FEDERATION_REGIONS]),
});

export function buildApp() {
  const app = Fastify({ logger: true });

  // ── Health ──────────────────────────────────────────────────────────

  app.get("/health", async () => ({
    status: "ok",
    service: "ghost-validator-federation",
    version: "1.0.0",
    port: 7981,
    validatorCount: reputationEngine.getAll().length,
    atRiskCount: reputationEngine.getAtRisk().length,
    pendingSlashCount: getPendingRecommendations().length,
    timestamp: Date.now(),
  }));

  // ── Validators ─────────────────────────────────────────────────────

  app.get("/validators", async () => reputationEngine.getAll());

  app.get<{ Params: { address: string } }>("/validators/:address", async (req, reply) => {
    const v = reputationEngine.getByAddress(req.params.address);
    if (!v) return reply.status(404).send({ error: "Validator not found" });
    return v;
  });

  app.get<{ Params: { region: string } }>("/validators/region/:region", async (req, reply) => {
    const region = req.params.region.toUpperCase() as FederationRegion;
    if (!(FEDERATION_REGIONS as readonly string[]).includes(region)) {
      return reply.status(400).send({ error: "Invalid region" });
    }
    return reputationEngine.getByRegion(region);
  });

  app.post("/validators/onboard", async (req, reply) => {
    const parse = OnboardSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    const record = reputationEngine.onboard(parse.data.address, parse.data.region);
    return { ok: true, record };
  });

  app.post("/validators/update", async (req, reply) => {
    const parse = ReputationUpdateSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    try {
      const { record, result } = reputationEngine.update(parse.data);
      return { ok: true, record, action: result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(404).send({ error: msg });
    }
  });

  app.get<{ Querystring: { region?: string } }>("/validators/leaderboard", async (req) => {
    const region = req.query.region?.toUpperCase() as FederationRegion | undefined;
    return reputationEngine.getLeaderboard(region);
  });

  app.get("/validators/at-risk", async () => reputationEngine.getAtRisk());

  // ── Slashing ────────────────────────────────────────────────────────

  app.get("/slash/recommendations", async () => getPendingRecommendations());

  app.post("/slash/scan", async () => {
    const results = await scanAllAtRisk();
    const produced = results.filter(Boolean);
    return { ok: true, scanned: reputationEngine.getAtRisk().length, recommendations: produced.length };
  });

  app.post<{ Params: { address: string } }>("/slash/analyze/:address", async (req, reply) => {
    const v = reputationEngine.getByAddress(req.params.address);
    if (!v) return reply.status(404).send({ error: "Validator not found" });
    const rec = await analyzeAndRecommend(v);
    return { ok: true, recommendation: rec };
  });

  return app;
}
