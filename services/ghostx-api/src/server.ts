import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";

import ordersRouter from "./routes/orders";
import bookRouter   from "./routes/book";
import { attachWebSocket } from "./ws";

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT ?? 4100;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin:  process.env.CORS_ORIGIN ?? "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
}));
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ghostx-api", ts: Date.now() });
});

app.use("/orders", ordersRouter);
app.use("/book",   bookRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── WebSocket ───────────────────────────────────────────────────────────────

attachWebSocket(server);

// ─── Start ───────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[ghostx-api] Listening on port ${PORT}`);
  console.log(`[ghostx-api] WebSocket available at ws://localhost:${PORT}/ws`);
  const relay = process.env.L2_RPC_URL ? "enabled" : "disabled (no L2_RPC_URL)";
  console.log(`[ghostx-api] Chain relay: ${relay}`);
});
