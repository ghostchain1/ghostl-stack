/**
 * GhostBrain Cluster — Routes
 *
 * /api/v1/cluster/gossip        POST  gossip push-pull
 * /api/v1/cluster/heartbeat     POST  leader election heartbeat
 * /api/v1/cluster/agent-report  POST  agent node metric push
 * /api/v1/cluster/status        GET   cluster summary
 * /api/v1/cluster/leader        GET   current leader
 * /api/v1/cluster/nodes         GET   all known peers + agents
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mergeGossip, buildGossipMessage } from "../cluster_gossip.js";
import { receiveHeartbeat, currentLeader, currentTerm, isLeader } from "../cluster_consensus.js";
import { upsertAgentNode, getClusterPeers, getAgentNodes, getClusterSummary } from "../cluster_node.js";
import type { GossipMessage, HeartbeatMessage, NodeMetrics } from "../types.js";
import { CLUSTER_NODE_ID, CLUSTER_NODE_URL, CLUSTER_PRIORITY } from "../cluster_node.js";
import { verifyClusterHmac } from "../cluster_hmac.js";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const NodeMetricsSchema = z.object({
  nodeId:    z.string(),
  timestamp: z.number(),
  cpu:       z.object({ usagePercent: z.number(), iowaitPercent: z.number(), cores: z.number() }),
  memory:    z.object({ totalMb: z.number(), usedMb: z.number(), usagePercent: z.number(), swapUsedMb: z.number() }),
  disk:      z.object({ readKbps: z.number(), writeKbps: z.number(), ioSaturationPercent: z.number() }),
  network:   z.object({ rxKbps: z.number(), txKbps: z.number(), errors: z.number() }),
}).optional();

const GossipSchema = z.object({
  nodeId:   z.string().min(1),
  nodeUrl:  z.string().url(),
  priority: z.number().int(),
  version:  z.number().int(),
  metrics:  NodeMetricsSchema,
  peers:    z.array(z.object({
    nodeId:   z.string(),
    url:      z.string(),
    lastSeen: z.number(),
    priority: z.number(),
  })),
  ts: z.number(),
});

const HeartbeatSchema = z.object({
  nodeId:   z.string().min(1),
  nodeUrl:  z.string().url(),
  priority: z.number().int(),
  isLeader: z.boolean(),
  term:     z.number().int(),
  ts:       z.number(),
});

const AgentReportSchema = z.object({
  nodeId:         z.string().min(1),
  agentUrl:       z.string(),
  node:           NodeMetricsSchema,
  vmCount:        z.number().int().default(0),
  containerCount: z.number().int().default(0),
  ts:             z.number(),
});

// ── Route registration ────────────────────────────────────────────────────────

export async function clusterRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/v1/cluster/gossip — push-pull gossip endpoint
  app.post("/api/v1/cluster/gossip", async (req, reply) => {
    const parsed = GossipSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_gossip", detail: parsed.error.flatten() });
    }
    const auth = verifyClusterHmac(
      parsed.data.nodeId,
      req.headers["x-cluster-signature"] as string | undefined,
      req.headers["x-cluster-timestamp"] as string | undefined,
    );
    if (!auth.ok) {
      return reply.status(401).send({ error: "unauthorized", reason: auth.reason });
    }
    mergeGossip(parsed.data as GossipMessage);
    // Return our own state to complete the push-pull
    return reply.send(buildGossipMessage());
  });

  // POST /api/v1/cluster/heartbeat — leader heartbeat
  app.post("/api/v1/cluster/heartbeat", async (req, reply) => {
    const parsed = HeartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_heartbeat" });
    }
    const auth = verifyClusterHmac(
      parsed.data.nodeId,
      req.headers["x-cluster-signature"] as string | undefined,
      req.headers["x-cluster-timestamp"] as string | undefined,
    );
    if (!auth.ok) {
      return reply.status(401).send({ error: "unauthorized", reason: auth.reason });
    }
    receiveHeartbeat(parsed.data as HeartbeatMessage);
    return reply.status(204).send();
  });

  // POST /api/v1/cluster/agent-report — agent node metric push
  app.post("/api/v1/cluster/agent-report", async (req, reply) => {
    const parsed = AgentReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_report", detail: parsed.error.flatten() });
    }
    const d = parsed.data;
    upsertAgentNode({
      nodeId:         d.nodeId,
      agentUrl:       d.agentUrl,
      metrics:        d.node as NodeMetrics | undefined,
      vmCount:        d.vmCount,
      containerCount: d.containerCount,
    });
    return reply.status(204).send();
  });

  // GET /api/v1/cluster/status — cluster summary
  app.get("/api/v1/cluster/status", async (_req, reply) => {
    return reply.send({
      ok:       true,
      self:     { nodeId: CLUSTER_NODE_ID, url: CLUSTER_NODE_URL, priority: CLUSTER_PRIORITY, isLeader: isLeader() },
      leader:   currentLeader(),
      term:     currentTerm(),
      summary:  getClusterSummary(),
    });
  });

  // GET /api/v1/cluster/leader
  app.get("/api/v1/cluster/leader", async (_req, reply) => {
    return reply.send({ leader: currentLeader(), term: currentTerm(), isMe: isLeader() });
  });

  // GET /api/v1/cluster/nodes — all known peers + agents
  app.get("/api/v1/cluster/nodes", async (_req, reply) => {
    return reply.send({
      ok:     true,
      peers:  getClusterPeers(),
      agents: getAgentNodes(),
    });
  });

  // GET /api/v1/cluster/node-load — per-node CPU/mem load sorted light→heavy
  // Used by ghostbrain-swarm to route tasks to the least-loaded nodes.
  app.get("/api/v1/cluster/node-load", async (_req, reply) => {
    const nodes = getAgentNodes().map(a => ({
      nodeId:         a.nodeId,
      agentUrl:       a.agentUrl,
      cpuPercent:     a.metrics?.cpu.usagePercent  ?? 0,
      memPercent:     a.metrics?.memory.usagePercent ?? 0,
      // Combined pressure score (0-100): equal weight on CPU + memory
      loadScore: ((a.metrics?.cpu.usagePercent ?? 0) + (a.metrics?.memory.usagePercent ?? 0)) / 2,
      vmCount:        a.vmCount,
      containerCount: a.containerCount,
      lastSeen:       a.lastSeen,
    }));
    // Lightest node first so consumers can easily pick index 0
    nodes.sort((a, b) => a.loadScore - b.loadScore);
    return reply.send({ ok: true, nodes, ts: Date.now() });
  });
}
