/**
 * Ghost Federation Coordinator — Fastify App (port 7980)
 * Routes: clusters, nodes, GIP relay, failover management.
 */
import Fastify from "fastify";
import { z } from "zod";
import {
  RegisterClusterSchema,
  GipMessageSchema,
  ClusterNodeSchema,
  type FederationRegion,
  FEDERATION_REGIONS,
} from "ghost-federation-sdk";
import { regionRegistry } from "./regionRegistry.js";
import { gipRelay } from "./gipRelay.js";
import { failoverOrchestrator } from "./failover.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  // ── Health ─────────────────────────────────────────────────────────

  app.get("/health", async () => {
    const clusters = regionRegistry.getAllClusters();
    const healthy = clusters.filter((c) => c.status === "healthy").length;
    return {
      status: "ok",
      service: "ghost-federation-coordinator",
      version: "1.0.0",
      port: 7980,
      clusters: { total: clusters.length, healthy, degraded: clusters.filter((c) => c.status === "degraded").length, offline: clusters.filter((c) => c.status === "offline").length },
      activeFailovers: failoverOrchestrator.getActive().length,
      timestamp: Date.now(),
    };
  });

  // ── Clusters ───────────────────────────────────────────────────────

  app.get("/clusters", async () => regionRegistry.getAllClusters());

  app.get<{ Params: { region: string } }>("/clusters/:region", async (req, reply) => {
    const region = req.params.region.toUpperCase() as FederationRegion;
    if (!(FEDERATION_REGIONS as readonly string[]).includes(region)) {
      return reply.status(400).send({ error: "Invalid region" });
    }
    const cluster = regionRegistry.getCluster(region);
    if (!cluster) return reply.status(404).send({ error: "Cluster not found" });
    return cluster;
  });

  app.post("/clusters/register", async (req, reply) => {
    const parse = RegisterClusterSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    const { region, nodes } = parse.data;
    for (const node of nodes) {
      regionRegistry.registerNode({ online: false, blockL1: 0, blockL2: 0, blockL3: 0, lastSeen: 0, ...node });
    }
    return { ok: true, region, nodesRegistered: nodes.length };
  });

  // ── Nodes ──────────────────────────────────────────────────────────

  app.get("/nodes", async () => regionRegistry.getAllNodes());

  app.post("/nodes/register", async (req, reply) => {
    const parse = ClusterNodeSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    regionRegistry.registerNode({ online: false, blockL1: 0, blockL2: 0, blockL3: 0, lastSeen: 0, ...parse.data });
    return { ok: true, nodeId: parse.data.id };
  });

  app.delete<{ Params: { nodeId: string } }>("/nodes/:nodeId", async (req) => {
    regionRegistry.removeNode(req.params.nodeId);
    return { ok: true };
  });

  // ── GIP ────────────────────────────────────────────────────────────

  app.post("/gip/relay", async (req, reply) => {
    const parse = GipMessageSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    const result = await gipRelay.relay(parse.data as Parameters<typeof gipRelay.relay>[0]);
    return result;
  });

  app.post("/gip/ingest", async (req) => {
    const parse = GipMessageSchema.safeParse(req.body);
    if (!parse.success) return { ok: false };
    gipRelay.ingest(parse.data as Parameters<typeof gipRelay.ingest>[0]);
    return { ok: true };
  });

  app.get<{ Querystring: { limit?: string } }>("/gip/history", async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    return gipRelay.getHistory(limit);
  });

  // ── Failover ───────────────────────────────────────────────────────

  app.post<{ Params: { region: string } }>("/failover/:region", async (req, reply) => {
    const region = req.params.region.toUpperCase() as FederationRegion;
    if (!(FEDERATION_REGIONS as readonly string[]).includes(region)) {
      return reply.status(400).send({ error: "Invalid region" });
    }
    const cluster = regionRegistry.getCluster(region);
    if (cluster) failoverOrchestrator.detectAndHandle({ ...cluster, status: "offline" });
    return { ok: true, region };
  });

  app.post<{ Body: { failoverId: string } }>("/failover/ack", async (req, reply) => {
    const { failoverId } = req.body ?? {};
    if (!failoverId) return reply.status(400).send({ error: "failoverId required" });
    failoverOrchestrator.ackFailover(String(failoverId));
    return { ok: true };
  });

  app.get("/failover/status", async () => ({
    active: failoverOrchestrator.getActive(),
    history: failoverOrchestrator.getAllFailovers(),
  }));

  return app;
}
