/**
 * GhostBrain Core — WebSocket message server
 *
 * Attaches to Fastify's underlying http.Server after listen().
 * Auth: API key checked in the first `auth` message (connect handshake).
 *
 * Topics handled:
 *   ghost.route.decide          → TxRouteDecision
 *   ghost.swarm.heartbeat       → { ok: true }
 *   ghost.swarm.leader.elect    → { leaderId, term }
 *   ghost.swarm.task.dispatch   → { queued: true, taskId }
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { randomUUID } from "crypto";

// ── Types mirrored from @ghost/ai-sdk (no import — avoid circular dep) ──────

interface GhostWsMessage {
  id:       string;
  topic:    string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>;
}

interface GhostWsResponse {
  id:      string;
  ok:      boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  error?:  string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

const VALID_API_KEYS = new Set(
  (process.env.GHOSTBRAIN_WS_API_KEYS ?? process.env.CONTROL_PLANE_HMAC_SECRET ?? "dev-key")
    .split(",")
    .map(k => k.trim())
    .filter(Boolean)
);

// ── Active leader state (in-memory, single-node) ─────────────────────────────

let currentLeaderId = `ghostbrain-${randomUUID().slice(0, 8)}`;
let currentTerm     = 1;

// ── Task queue (lightweight in-memory) ───────────────────────────────────────

const taskQueue: Array<{ taskId: string; kind: string; priority: number; queuedAt: number }> = [];

// ── Handler dispatch ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMessage(msg: GhostWsMessage): Promise<any> {
  switch (msg.topic) {

    case "ghost.route.decide": {
      const { from, to, intent } = msg.payload ?? {};

      // Enforce single-hop policy: L3→L2 or L2→L1 only
      const hop: Record<string, string> = { L3: "L2", L2: "L1", L1: "L1" };
      const executeOn = hop[from as string] ?? "L1";
      const requiresMessaging = from !== to;

      return {
        plan: {
          path:              from !== to ? [from, executeOn] : [executeOn],
          executeOn,
          requiresMessaging,
          reason:            intent ?? "ghost-routing-law",
        },
        riskScore: 0.05,
        notes:     ["Routed by GhostBrain deterministic policy"],
      };
    }

    case "ghost.swarm.heartbeat": {
      return { ok: true, receivedAt: Date.now() };
    }

    case "ghost.swarm.leader.elect": {
      const { nodeId } = msg.payload ?? {};
      // Simple: first caller becomes leader, then increment term each round
      if (nodeId) {
        currentLeaderId = nodeId as string;
        currentTerm    += 1;
      }
      return { leaderId: currentLeaderId, term: currentTerm };
    }

    case "ghost.swarm.task.dispatch": {
      const task = msg.payload ?? {};
      const taskId = (task.taskId as string) ?? randomUUID();
      taskQueue.push({
        taskId,
        kind:      (task.kind as string) ?? "ops",
        priority:  (task.priority as number) ?? 3,
        queuedAt:  Date.now(),
      });
      // Keep queue bounded
      if (taskQueue.length > 1_000) taskQueue.shift();
      return { queued: true, taskId, queueDepth: taskQueue.length };
    }

    default:
      throw new Error(`unknown topic: ${msg.topic}`);
  }
}

// ── Per-connection session ────────────────────────────────────────────────────

function handleConnection(ws: WebSocket, _req: IncomingMessage): void {
  let authenticated = false;

  ws.on("message", async (raw: Buffer | string) => {
    let parsed: GhostWsMessage;

    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as GhostWsMessage;
    } catch {
      ws.send(JSON.stringify({ id: "?", ok: false, error: "invalid JSON" }));
      return;
    }

    // ── Handshake auth message ──────────────────────────────────────────
    if (parsed.topic === "auth") {
      const key = (parsed.payload?.apiKey as string) ?? "";
      if (VALID_API_KEYS.has(key)) {
        authenticated = true;
        ws.send(JSON.stringify({ id: parsed.id, ok: true, result: { authenticated: true } }));
      } else {
        ws.send(JSON.stringify({ id: parsed.id, ok: false, error: "unauthorized" }));
        ws.close(4001, "unauthorized");
      }
      return;
    }

    if (!authenticated) {
      ws.send(JSON.stringify({ id: parsed.id ?? "?", ok: false, error: "not authenticated" }));
      return;
    }

    // ── Dispatch to topic handler ───────────────────────────────────────
    const resp: GhostWsResponse = { id: parsed.id, ok: false };
    try {
      resp.result = await handleMessage(parsed);
      resp.ok     = true;
    } catch (err: unknown) {
      resp.error = err instanceof Error ? err.message : String(err);
    }

    ws.send(JSON.stringify(resp));
  });

  ws.on("error", () => { /* absorbed — connection errors are surfaced via close */ });
}

// ── Public factory ────────────────────────────────────────────────────────────

export function attachWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", handleConnection);

  wss.on("error", (err) => {
    console.error("[ghostbrain-ws] server error:", err.message);
  });

  return wss;
}
