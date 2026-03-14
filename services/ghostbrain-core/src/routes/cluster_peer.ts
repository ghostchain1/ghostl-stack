/**
 * GhostBrain Core — Cluster Integration Route
 *
 * Registers ghostbrain-core as a peer in the GhostBrain cluster mesh.
 * Optionally reports itself to the cluster coordinator on startup.
 *
 * GET  /api/v1/cluster/peer-info  — self-description for cluster gossip
 * POST /api/v1/cluster/register   — register/join a remote cluster coordinator
 */

import type { FastifyInstance } from "fastify";
import { request }              from "undici";

const SELF_URL    = process.env.GHOSTBRAIN_CORE_URL ?? "http://127.0.0.1:7900";
const CLUSTER_URL = process.env.CLUSTER_URL         ?? "";

export async function clusterPeerRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/v1/cluster/peer-info
  // Returns a self-description that cluster gossip can import
  app.get("/api/v1/cluster/peer-info", async (_req, reply) => {
    return reply.send({
      ok:       true,
      role:     "ghostbrain-core",
      nodeId:   `ghostbrain-core-${process.env.HOSTNAME ?? "local"}`,
      url:      SELF_URL,
      clusterUrl: CLUSTER_URL || null,
      uptime:   process.uptime(),
      ts:       Date.now(),
    });
  });

  // POST /api/v1/cluster/register
  // Manually trigger self-registration to a cluster coordinator
  app.post("/api/v1/cluster/register", async (req, reply) => {
    const b          = req.body as { clusterUrl?: string } | null;
    const targetCluster = b?.clusterUrl ?? CLUSTER_URL;
    if (!targetCluster) {
      return reply.status(400).send({ error: "clusterUrl required" });
    }
    try {
      const res = await request(`${targetCluster}/api/v1/cluster/agent-report`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nodeId:         `ghostbrain-core-${process.env.HOSTNAME ?? "local"}`,
          agentUrl:       SELF_URL,
          vmCount:        0,
          containerCount: 0,
          ts:             Date.now(),
        }),
        bodyTimeout: 8_000,
      });
      return reply.send({ ok: res.statusCode < 300, registeredTo: targetCluster });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(502).send({ error: "cluster_unreachable", detail: msg });
    }
  });
}

/** Self-registers with the cluster coordinator at startup (non-blocking) */
export async function selfRegisterWithCluster(): Promise<void> {
  if (!CLUSTER_URL) return;
  try {
    await request(`${CLUSTER_URL}/api/v1/cluster/agent-report`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        nodeId:         `ghostbrain-core-${process.env.HOSTNAME ?? "local"}`,
        agentUrl:       SELF_URL,
        vmCount:        0,
        containerCount: 0,
        ts:             Date.now(),
      }),
      bodyTimeout: 6_000,
    });
  } catch { /* cluster may not be up yet — non-fatal */ }
}
