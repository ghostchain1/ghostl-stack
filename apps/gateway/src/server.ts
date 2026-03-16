/**
 * GhostChain Unified API Gateway
 *
 * Routes:
 *   /api/*   → ghostl-api:4000   (REST API backend)
 *   /ws/*    → ghost-ws-gateway  (WebSocket / SSE broadcast)
 *   /health  → gateway health check
 *
 * Port: 8080 (configurable via PORT env var)
 */

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import rateLimit from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { IncomingMessage } from "http";

const PORT = Number(process.env.PORT ?? 8080);
const API_TARGET = process.env.API_TARGET ?? "http://ghostl-api:4000";
const WS_TARGET = process.env.WS_TARGET ?? "http://ghost-ws-gateway:8085";

// ── LitVybzLive economy service targets ───────────────────────────────────────
const LITVYB_ECONOMY_TARGETS: Record<string, string> = {
  treasury:    process.env.LITVYB_TREASURY_URL    ?? "http://creator-treasury:7040",
  memberships: process.env.LITVYB_MEMBERSHIPS_URL ?? "http://fan-memberships:7041",
  tokens:      process.env.LITVYB_TOKENS_URL      ?? "http://creator-tokens:7042",
  gifts:       process.env.LITVYB_GIFTS_URL       ?? "http://nft-gifts:7043",
  staking:     process.env.LITVYB_STAKING_URL     ?? "http://staking-engine:7044",
  revenue:     process.env.LITVYB_REVENUE_URL     ?? "http://revenue-distribution:7045",
  dao:         process.env.LITVYB_DAO_URL         ?? "http://fan-dao:7046",
  marketplace: process.env.LITVYB_MARKETPLACE_URL ?? "http://marketplace:7047",
};

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3200")
  .split(",")
  .map((o) => o.trim());

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // managed by the Next.js frontend
    crossOriginEmbedderPolicy: false,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*")) {
        cb(null, true);
      } else {
        cb(new Error("CORS: origin not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  })
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — GhostChain Gateway rate limit exceeded" },
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-forwarded-for"] as string ?? req.ip ?? "unknown",
  message: { error: "API rate limit exceeded" },
});

app.use(globalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ghost-gateway",
    uptime: process.uptime(),
    targets: { api: API_TARGET, ws: WS_TARGET, economy: LITVYB_ECONOMY_TARGETS },
    ts: new Date().toISOString(),
  });
});

// ── API proxy ─────────────────────────────────────────────────────────────────
app.use(
  "/api",
  apiLimiter,
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    // Strip the /api prefix so ghostl-api sees /v1/... paths directly
    pathRewrite: { "^/api": "" },
    on: {
      error: (err, _req, res) => {
        console.error("[gateway] API proxy error:", (err as Error).message);
        if (!("headersSent" in res) || !(res as unknown as { headersSent: boolean }).headersSent) {
          (res as unknown as import("http").ServerResponse).writeHead(502, { "Content-Type": "application/json" });
          (res as unknown as import("http").ServerResponse).end(JSON.stringify({ error: "Bad Gateway — GhostChain API unavailable" }));
        }
      },
    },
  })
);

// ── LitVybzLive economy service proxies ───────────────────────────────────────
// Routes: /litvyb/<segment>/* → economy microservice
// Each segment maps to a named service in LITVYB_ECONOMY_TARGETS.

const economyLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-forwarded-for"] as string ?? req.ip ?? "unknown",
  message: { error: "LitVybzLive economy rate limit exceeded" },
});

// Allowlist of valid economy route segments (prevents open-proxy abuse)
const ECONOMY_ROUTE_ALLOWLIST = new Set(Object.keys(LITVYB_ECONOMY_TARGETS));

for (const [segment, target] of Object.entries(LITVYB_ECONOMY_TARGETS)) {
  if (!ECONOMY_ROUTE_ALLOWLIST.has(segment)) continue; // belt-and-suspenders guard

  app.use(
    `/litvyb/${segment}`,
    economyLimiter,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: { [`^/litvyb/${segment}`]: "" },
      on: {
        error: (err, _req, res) => {
          console.error(`[gateway] economy/${segment} proxy error:`, (err as Error).message);
          if (!("headersSent" in res) || !(res as unknown as { headersSent: boolean }).headersSent) {
            (res as unknown as import("http").ServerResponse).writeHead(502, { "Content-Type": "application/json" });
            (res as unknown as import("http").ServerResponse).end(
              JSON.stringify({ error: `Bad Gateway — LitVybzLive ${segment} service unavailable` })
            );
          }
        },
      },
    })
  );
}

// ── HTTP server + WebSocket proxy ─────────────────────────────────────────────
const server = http.createServer(app);

import httpProxy from "http-proxy";

const wsProxy = httpProxy.createProxyServer({ target: WS_TARGET, ws: true });

wsProxy.on("error", (err, _req, socket) => {
  console.error("[gateway] WS proxy error:", err.message);
  if (socket && "destroy" in socket) (socket as import("net").Socket).destroy();
});

server.on("upgrade", (req: IncomingMessage, socket, head) => {
  // Only proxy WebSocket upgrades on /ws paths
  const url = req.url ?? "/";
  if (url.startsWith("/ws")) {
    wsProxy.ws(req, socket as unknown as import("net").Socket, head);
  } else {
    socket.destroy();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[GhostChain Gateway] listening on :${PORT}`);
  console.log(`  → API  proxy: ${API_TARGET}`);
  console.log(`  → WS   proxy: ${WS_TARGET}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("[gateway] shutting down…");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
