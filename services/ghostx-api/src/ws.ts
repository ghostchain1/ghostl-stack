import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { engine } from "./matchingEngine";
import { Fill, LimitOrder } from "./types";

type WsMsg =
  | { type: "fill";   data: object }
  | { type: "order";  data: object }
  | { type: "cancel"; data: object }
  | { type: "ping" }
  | { type: "pong" };

function broadcast(wss: WebSocketServer, msg: WsMsg): void {
  const raw = JSON.stringify(msg);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(raw);
  });
}

function serializeFill(f: Fill) {
  return { ...f, baseAmount: f.baseAmount.toString(), price: f.price.toString() };
}

function serializeOrder(o: LimitOrder) {
  return {
    ...o,
    price:      o.price.toString(),
    baseAmount: o.baseAmount.toString(),
    filled:     o.filled.toString(),
    onChainId:  o.onChainId?.toString(),
  };
}

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    // Send current state as a snapshot on connection.
    ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch { /* ignore */ }
    });
  });

  // ── Forward engine events to all connected clients ────────────────────────

  engine.on("fill", (fill: Fill) => {
    broadcast(wss, { type: "fill", data: serializeFill(fill) });
  });

  engine.on("order", (order: LimitOrder) => {
    broadcast(wss, { type: "order", data: serializeOrder(order) });
  });

  engine.on("cancel", (order: LimitOrder) => {
    broadcast(wss, { type: "cancel", data: serializeOrder(order) });
  });

  return wss;
}
