/**
 * Ghost Interplanetary Coordinator — Fastify application
 * Port 7985
 *
 * Manages interplanetary node registry, offline consensus zones,
 * routing topology, and delayed governance votes.
 */
import Fastify from "fastify";
import {
  InterplanetaryNodeSchema,
  InterplanetaryVoteSchema,
  type InterplanetaryVote,
} from "ghost-interplanetary-sdk";
import {
  registerNode,
  removeNode,
  getNode,
  getAllNodes,
  getByEnvironment,
  getOnline,
  envSummary,
  startProbing,
  stopProbing,
} from "./nodeRegistry.js";
import {
  getAllZones,
  getZone,
  detectPartitions,
  triggerSync,
  updateZoneBlockHeight,
  incrementPendingVotes,
} from "./offlineConsensus.js";
import {
  buildTopology,
  computeRoute,
  getAllCachedRoutes,
  requestAiOptimization,
  scheduleOptimization,
} from "./routingOptimizer.js";
import { randomUUID } from "node:crypto";

const PROBING_INTERVAL_MS = Number(process.env.PROBING_INTERVAL_MS ?? 60_000);

// In-memory vote store (keyed by proposalId)
const votes = new Map<string, InterplanetaryVote[]>();

export function buildApp() {
  const app = Fastify({ logger: true });

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get("/health", async () => {
    const summary = envSummary();
    const zones = getAllZones().length;
    const routes = getAllCachedRoutes().length;
    return { ok: true, service: "ghost-interplanetary-coordinator", summary, zones, routes };
  });

  // ── Nodes ──────────────────────────────────────────────────────────────────
  app.get("/nodes", async () => ({ nodes: getAllNodes() }));

  app.get<{ Params: { id: string } }>("/nodes/:id", async (req, reply) => {
    const node = getNode(req.params.id);
    if (!node) return reply.code(404).send({ error: "not_found" });
    return { node };
  });

  app.get<{ Params: { env: string } }>("/nodes/environment/:env", async (req, reply) => {
    const valid = ["earth", "orbital", "lunar", "deep-space"] as const;
    if (!valid.includes(req.params.env as (typeof valid)[number]))
      return reply.code(400).send({ error: "invalid_environment" });
    return { nodes: getByEnvironment(req.params.env as (typeof valid)[number]) };
  });

  app.get("/nodes/online", async () => ({ nodes: getOnline() }));

  app.post("/nodes/register", async (req, reply) => {
    const parsed = InterplanetaryNodeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const node = registerNode(parsed.data);
    return reply.code(201).send({ node });
  });

  app.delete<{ Params: { id: string } }>("/nodes/:id", async (req, reply) => {
    const ok = removeNode(req.params.id);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return { removed: req.params.id };
  });

  // ── Offline Consensus Zones ────────────────────────────────────────────────
  app.get("/zones", async () => ({ zones: getAllZones() }));

  app.get<{ Params: { id: string } }>("/zones/:id", async (req, reply) => {
    const z = getZone(req.params.id);
    if (!z) return reply.code(404).send({ error: "not_found" });
    return { zone: z };
  });

  app.post<{ Body: { earthBlockHeight?: number } }>("/zones/detect", async (req) => {
    const height = req.body?.earthBlockHeight ?? 0;
    const newZones = detectPartitions(height);
    return { detected: newZones.length, zones: newZones };
  });

  app.post<{ Params: { id: string } }>("/zones/:id/sync", async (req, reply) => {
    const ok = triggerSync(req.params.id);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return { syncing: req.params.id };
  });

  app.patch<{
    Params: { id: string };
    Body: { localBlockHeight?: number };
  }>("/zones/:id/block-height", async (req, reply) => {
    const height = req.body?.localBlockHeight;
    if (typeof height !== "number")
      return reply.code(400).send({ error: "localBlockHeight required" });
    const ok = updateZoneBlockHeight(req.params.id, height);
    if (!ok) return reply.code(404).send({ error: "not_found" });
    return { updated: req.params.id, localBlockHeight: height };
  });

  // ── Routing ────────────────────────────────────────────────────────────────
  app.get("/routing/topology", async () => {
    const routes = buildTopology();
    return { nodes: getAllNodes().length, routes: routes.length, topology: routes };
  });

  app.get<{ Params: { from: string; to: string } }>(
    "/routing/:from/:to",
    async (req, reply) => {
      const route = computeRoute(req.params.from, req.params.to);
      if (!route) return reply.code(404).send({ error: "route_not_found" });
      return { route };
    }
  );

  app.post("/routing/optimize", async () => {
    const suggestions = await requestAiOptimization();
    const topology = buildTopology();
    return { optimized: true, routeCount: topology.length, aiSuggestions: suggestions };
  });

  // ── Interplanetary Votes ───────────────────────────────────────────────────
  app.post("/votes", async (req, reply) => {
    const parsed = InterplanetaryVoteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const vote: InterplanetaryVote = {
      ...parsed.data,
      submittedAt: Date.now(),
    };

    const existing = votes.get(vote.proposalId) ?? [];
    existing.push(vote);
    votes.set(vote.proposalId, existing);

    // Track in zone if voter is in an isolated zone
    const allZones = getAllZones();
    const voterZone = allZones.find((z) => z.nodeIds.includes(vote.voterNodeId));
    if (voterZone) incrementPendingVotes(voterZone.id);

    return reply.code(201).send({ vote });
  });

  app.get<{ Params: { proposalId: string } }>("/votes/:proposalId", async (req, reply) => {
    const proposalVotes = votes.get(req.params.proposalId) ?? [];
    const tally = { for: 0, against: 0, abstain: 0 };
    for (const v of proposalVotes) tally[v.choice]++;
    return { proposalId: req.params.proposalId, tally, votes: proposalVotes };
  });

  return { app, startProbing: () => startProbing(PROBING_INTERVAL_MS), stopProbing, scheduleOptimization };
}

export type AppModule = ReturnType<typeof buildApp>;
