/**
 * GhostBrain Core — Standalone WebSocket server
 *
 * Can be used stand-alone (node ws/server.ts) or imported from index.ts.
 * Duplicates no Fastify logic — purely ws.WebSocketServer over its own
 * http.Server so it can bind an independent port if needed.
 *
 * Topics:
 *   ghost.route.decide          → TxRouteDecision (selector-aware heuristic)
 *   ghost.swarm.heartbeat       → { ok: true }
 *   ghost.swarm.leader.elect    → { leaderId, term }
 *   ghost.swarm.task.dispatch   → { accepted, taskId }
 */

import http        from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket }  from "ws";
import { randomUUID }      from "node:crypto";
import { decideGhostRoute, type GhostRouteDecision } from "../core/routeDecision.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type Layer = "L1" | "L2" | "L3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

interface ReqMsg {
  id:       string;
  topic:    string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

interface ResMsg {
  id:      string;
  ok:      boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?:  any;
}

interface SwarmNode {
  nodeId: string;
  group:  string;
}

type TxRouteDecision = GhostRouteDecision;

interface GhostBrainConfig {
  wsPath: string;
  policy: {
    routingPath:    Layer[];
    enforceNoJump:  boolean;
  };
  auth?: {
    requireApiKey: boolean;
    apiKeys?:      Set<string>;
  };
}

// ── Static config ─────────────────────────────────────────────────────────────

const cfg: GhostBrainConfig = {
  wsPath: "/ws",
  policy: {
    routingPath:   ["L3", "L2", "L1"],
    enforceNoJump: true,
  },
  auth: {
    requireApiKey: false,
    apiKeys:       new Set(
      (process.env.GHOSTBRAIN_WS_API_KEYS ?? "dev-key")
        .split(",").map(k => k.trim()).filter(Boolean)
    ),
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function reply(ws: WebSocket, msg: ResMsg): void {
  ws.send(JSON.stringify(msg));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok(id: string, result: any): ResMsg { return { id, ok: true, result }; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fail(id: string, error: any): ResMsg { return { id, ok: false, error }; }

// ── Policy enforcement ────────────────────────────────────────────────────────

function enforceNoJump(path: Layer[]): void {
  const p = cfg.policy.routingPath;
  for (let i = 0; i < path.length - 1; i++) {
    const a = p.indexOf(path[i]!);
    const b = p.indexOf(path[i + 1]!);
    if (a === -1 || b === -1) continue;
    if (b - a > 1) {
      throw new Error(`Policy jump blocked: ${path[i]} → ${path[i + 1]}`);
    }
  }
}

// ── Swarm coordination ────────────────────────────────────────────────────────

const heartbeats = new Map<string, { node: SwarmNode; ts: number; meta: Json }>();
let currentLeader: { leaderId: string; term: number } = { leaderId: "none", term: 0 };

function leaderElect(node: SwarmNode): { leaderId: string; term: number } {
  const nodes = [...heartbeats.values()].map(h => h.node);
  nodes.push(node);
  const leaderId = nodes.map(n => n.nodeId).sort()[0] ?? node.nodeId;
  if (leaderId !== currentLeader.leaderId) {
    currentLeader = { leaderId, term: currentLeader.term + 1 };
  }
  return currentLeader;
}

async function dispatchTask(payload: Json): Promise<{ accepted: boolean; taskId: string }> {
  // Production: publish to queue / fanout to workers
  return { accepted: true, taskId: (payload?.task?.taskId as string | undefined) ?? randomUUID() };
}

// ── Connection handler ────────────────────────────────────────────────────────

function handleConn(ws: WebSocket, req: http.IncomingMessage): void {
  // Optional header-based API key auth (pre-connect)
  if (cfg.auth?.requireApiKey) {
    const key = req.headers["x-ghost-api-key"];
    if (!key || !cfg.auth.apiKeys?.has(String(key))) {
      ws.close(1008, "Unauthorized");
      return;
    }
  }

  let authenticated = !cfg.auth?.requireApiKey;

  ws.on("message", async (buf: Buffer | string) => {
    let msg: ReqMsg;
    try { msg = JSON.parse(buf.toString()) as ReqMsg; }
    catch { ws.send(JSON.stringify({ id: "?", ok: false, error: "invalid JSON" })); return; }

    const { id, topic, payload } = msg;

    // Auth handshake (message-level, used by GhostBrainWS SDK)
    if (topic === "auth") {
      const apiKey = (payload?.apiKey as string | undefined) ?? "";
      if (!cfg.auth?.requireApiKey || cfg.auth.apiKeys?.has(apiKey)) {
        authenticated = true;
        return reply(ws, ok(id, { authenticated: true }));
      }
      reply(ws, fail(id, "unauthorized"));
      ws.close(4001, "unauthorized");
      return;
    }

    if (!authenticated) {
      return reply(ws, fail(id, "not authenticated"));
    }

    try {
      if (topic === "ghost.route.decide") {
        return reply(ws, ok(id, decideGhostRoute((payload ?? {}) as Json, { routingPath: cfg.policy.routingPath })));
      }
      if (topic === "ghost.swarm.heartbeat") {
        const node   = (payload?.node as SwarmNode | undefined) ?? { nodeId: payload?.nodeId ?? "?", group: "default" };
        heartbeats.set(node.nodeId, { node, ts: Date.now(), meta: payload?.meta ?? {} });
        return reply(ws, ok(id, { ok: true, receivedAt: Date.now() }));
      }
      if (topic === "ghost.swarm.leader.elect") {
        const node = (payload?.node as SwarmNode | undefined) ?? { nodeId: payload?.nodeId ?? "?", group: "default" };
        return reply(ws, ok(id, leaderElect(node)));
      }
      if (topic === "ghost.swarm.task.dispatch") {
        return reply(ws, ok(id, await dispatchTask(payload ?? {})));
      }
      return reply(ws, fail(id, { code: "UNKNOWN_TOPIC", topic }));
    } catch (e: unknown) {
      return reply(ws, fail(id, { code: "EXCEPTION", message: e instanceof Error ? e.message : String(e) }));
    }
  });

  ws.on("error", () => { /* surfaced via close */ });
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface GhostBrainWSServerHandle {
  server: http.Server;
  wss:    WebSocketServer;
  close:  () => Promise<void>;
}

export function startGhostBrainWSServer(opts?: { port?: number }): GhostBrainWSServerHandle {
  const port   = opts?.port ?? 8080;
  const server = http.createServer();
  const wss    = new WebSocketServer({ server, path: cfg.wsPath });

  wss.on("connection", handleConn);
  wss.on("error", err => console.error("[ghostbrain-ws] server error:", err.message));

  server.listen(port, () => {
    console.log(`[ghostbrain-core] WS standalone listening on :${port}${cfg.wsPath}`);
  });

  return {
    server,
    wss,
    close: () => new Promise((res, rej) => {
      wss.close(err => {
        if (err) rej(err);
        else server.close(e => (e ? rej(e) : res()));
      });
    }),
  };
}
