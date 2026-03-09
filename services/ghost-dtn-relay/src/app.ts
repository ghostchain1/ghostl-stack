/**
 * ghost-dtn-relay — Fastify App (port 7983)
 * GDTP store-and-forward relay for interplanetary bundle routing.
 */
import Fastify from "fastify";
import { z } from "zod";
import {
  SubmitBundleSchema,
  NODE_ENVIRONMENTS,
  type NodeEnvironment,
} from "ghost-interplanetary-sdk";
import {
  createBundle,
  getBundle,
  getAllBundles,
  getPending,
  getByDestination,
  updateStatus,
  storeBundle,
  stats,
} from "./bundleStore.js";
import {
  forwardBundle,
  upsertRoute,
  getAllRoutes,
  computeRoute,
} from "./bundleRouter.js";

// Minimal hashes for API-submitted bundles that don't go through the bundle engine
const ZERO_HASH = "0".repeat(64);

const UpsertRouteSchema = z.object({
  sourceNodeId:   z.string().min(1),
  destNodeId:     z.string().min(1),
  hops:           z.array(z.object({ nodeId: z.string(), latencyMs: z.number(), reliable: z.boolean() })).min(1),
  totalLatencyMs: z.number().int().min(0),
  reliability:    z.number().min(0).max(1),
});

export function buildApp() {
  const app = Fastify({ logger: true });

  // ── Health ─────────────────────────────────────────────────────────

  app.get("/health", async () => ({
    status: "ok",
    service: "ghost-dtn-relay",
    version: "1.0.0",
    port: 7983,
    bundles: stats(),
    timestamp: Date.now(),
  }));

  // ── Bundles ────────────────────────────────────────────────────────

  app.get("/bundles", async () => getAllBundles());

  app.get("/bundles/pending", async () => getPending());

  app.get<{ Params: { id: string } }>("/bundles/:id", async (req, reply) => {
    const b = getBundle(req.params.id);
    if (!b) return reply.status(404).send({ error: "Bundle not found" });
    return b;
  });

  app.get<{ Querystring: { dest?: string } }>("/bundles/for", async (req) => {
    if (!req.query.dest) return [];
    return getByDestination(req.query.dest);
  });

  app.post("/bundles/submit", async (req, reply) => {
    const parse = SubmitBundleSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    const { sourceNodeId, destNodeId, priority, txHashes, environment } = parse.data;

    const bundle = createBundle({
      sourceNodeId,
      destNodeId,
      priority,
      txCount: txHashes.length,
      merkleRoot: ZERO_HASH,   // full merkle computed by bundle-engine
      zkProofHash: ZERO_HASH,
      payloadHash: ZERO_HASH,
      compressedBytes: txHashes.length * 32,
      environment,
    });
    return { ok: true, bundle };
  });

  // Ingest from peer relay (store-and-forward receive)
  app.post("/bundles/ingest", async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (typeof body?.id !== "string") return reply.status(400).send({ error: "Invalid bundle" });
    // Validate minimal shape
    const partial = {
      id: body.id,
      sourceNodeId: body.sourceNodeId,
      destNodeId: body.destNodeId,
      priority: body.priority ?? 5,
      ttlMs: body.ttlMs ?? 300_000,
      txCount: body.txCount ?? 0,
      merkleRoot: body.merkleRoot ?? ZERO_HASH,
      zkProofHash: body.zkProofHash ?? ZERO_HASH,
      payloadHash: body.payloadHash ?? ZERO_HASH,
      compressedBytes: body.compressedBytes ?? 0,
      createdAt: body.createdAt ?? Date.now(),
      expiresAt: body.expiresAt ?? Date.now() + 300_000,
      status: "pending" as const,
      hopCount: Number(body.hopCount ?? 0),
      route: Array.isArray(body.route) ? (body.route as string[]) : [],
    };
    if (typeof partial.sourceNodeId !== "string" || typeof partial.destNodeId !== "string") {
      return reply.status(400).send({ error: "sourceNodeId and destNodeId required" });
    }
    storeBundle(partial as import("ghost-interplanetary-sdk").GDTPBundle);
    return { ok: true, bundleId: partial.id };
  });

  app.post<{ Params: { id: string } }>("/bundles/:id/forward", async (req, reply) => {
    const result = await forwardBundle(req.params.id);
    if (!result.ok) return reply.status(422).send({ ok: false, error: "Forward failed or bundle not found" });
    return { forwarded: true, ...result };
  });

  app.patch<{ Params: { id: string }; Body: { status: string } }>("/bundles/:id/status", async (req, reply) => {
    const validStatuses = ["pending", "in-transit", "delivered", "expired", "failed"] as const;
    const s = (req.body as { status?: string })?.status;
    if (!s || !(validStatuses as readonly string[]).includes(s)) {
      return reply.status(400).send({ error: "Invalid status" });
    }
    const ok = updateStatus(req.params.id, s as typeof validStatuses[number]);
    if (!ok) return reply.status(404).send({ error: "Bundle not found" });
    return { ok: true };
  });

  // ── Routes ─────────────────────────────────────────────────────────

  app.get("/routes", async () => getAllRoutes());

  app.get<{ Params: { from: string; to: string } }>("/routes/:from/:to", async (req) => {
    const route = computeRoute(req.params.from, req.params.to);
    return route;
  });

  app.post("/routes", async (req, reply) => {
    const parse = UpsertRouteSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    const { sourceNodeId, destNodeId, hops, totalLatencyMs, reliability } = parse.data;
    upsertRoute({ sourceNodeId, destNodeId, hops, totalLatencyMs, reliability, computedAt: Date.now() });
    return { ok: true };
  });

  // ── Stats ──────────────────────────────────────────────────────────

  app.get("/stats", async () => stats());

  return app;
}
