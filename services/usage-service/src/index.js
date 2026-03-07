/**
 * @file usage-service/src/index.js
 * @description GhostChain API usage tracking and analytics service.
 *
 * Collects and aggregates API usage metrics: request counts, endpoint hit rates,
 * actor-level quotas, and rolling window statistics. Optionally reads from
 * Prometheus for live metrics.
 *
 * Env vars:
 *   PORT         (default 7651)
 *   PROM_URL     Optional Prometheus base URL (default http://localhost:9090)
 *   QUOTA_LIMIT  Default per-actor daily request quota (default 10000)
 */

import express from "express";

const PORT = Number(process.env.PORT || 7651);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const QUOTA_LIMIT = Number(process.env.QUOTA_LIMIT || 10000);

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.removeHeader("X-Powered-By");
  next();
});
const _CORS_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && _CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const _RL_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const _RL_MAX    = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const _rlStore   = new Map();
setInterval(() => _rlStore.clear(), _RL_WINDOW).unref();
app.use((req, res, next) => {
  const key = req.ip ?? "unknown";
  const count = (_rlStore.get(key) ?? 0) + 1;
  _rlStore.set(key, count);
  res.setHeader("X-RateLimit-Limit", _RL_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, _RL_MAX - count));
  if (count > _RL_MAX) return res.status(429).json({ error: "Too many requests" });
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id })));
  next();
});


// ─── In-process counters (resets on restart; production would use Redis/DB) ──

/** @type {Map<string, { requests: number, errors: number, lastSeen: string }>} */
const actorStats = new Map();

/** @type {Map<string, number>} */
const endpointCounts = new Map();

let totalRequests = 0;
let totalErrors = 0;
const startedAt = new Date().toISOString();

// ─── Prometheus helper ────────────────────────────────────────────────────────

const promQuery = async (query) => {
  const res = await fetch(
    `${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`,
    { signal: AbortSignal.timeout(4000) }
  );
  if (!res.ok) throw new Error(`prom http ${res.status}`);
  return res.json();
};

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "usage-service",
    uptime: process.uptime(),
    startedAt,
  });
});

/**
 * GET /usage
 * Returns aggregate usage statistics. Merges in-process counters with live
 * Prometheus data when available.
 */
app.get("/usage", async (_req, res) => {
  let promTotalReqs = null;
  let promRps = null;
  try {
    const [totalRes, rpsRes] = await Promise.all([
      promQuery("ghost_api_requests_total"),
      promQuery("rate(ghost_api_requests_total[1m])"),
    ]);
    promTotalReqs = totalRes?.data?.result?.[0]?.value?.[1] ?? null;
    promRps = rpsRes?.data?.result?.[0]?.value?.[1] ?? null;
  } catch {
    // Prometheus not available — use in-process counters
  }

  res.json({
    ok: true,
    usage: {
      totalRequests: promTotalReqs !== null ? Number(promTotalReqs) : totalRequests,
      totalErrors,
      requestsPerMinute: promRps !== null ? Number(promRps).toFixed(2) : null,
      actors: actorStats.size,
      endpoints: endpointCounts.size,
      quotaLimit: QUOTA_LIMIT,
      window: "rolling-1h",
      startedAt,
    },
  });
});

/**
 * GET /usage/actors
 * Per-actor usage breakdown.
 */
app.get("/usage/actors", (_req, res) => {
  const actors = Array.from(actorStats.entries()).map(([id, stats]) => ({
    id,
    ...stats,
    quotaUsed: stats.requests,
    quotaLimit: QUOTA_LIMIT,
    quotaRemaining: Math.max(0, QUOTA_LIMIT - stats.requests),
  }));
  res.json({ ok: true, actors });
});

/**
 * GET /usage/endpoints
 * Per-endpoint request counts.
 */
app.get("/usage/endpoints", (_req, res) => {
  const endpoints = Array.from(endpointCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
  res.json({ ok: true, endpoints });
});

/**
 * POST /usage/record
 * Record a usage event (called by API gateway or middleware).
 * Body: { actorId?, endpoint?, error?: boolean }
 */
app.post("/usage/record", (req, res) => {
  const { actorId = "anonymous", endpoint = "unknown", error = false } = req.body || {};
  totalRequests++;
  if (error) totalErrors++;

  // Actor stats
  const actor = actorStats.get(actorId) || { requests: 0, errors: 0, lastSeen: "" };
  actor.requests++;
  if (error) actor.errors++;
  actor.lastSeen = new Date().toISOString();
  actorStats.set(actorId, actor);

  // Endpoint counts
  endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + 1);

  res.json({ ok: true, recorded: true });
});

/**
 * GET /usage/stats — aggregate usage summary (named route before wildcard).
 */
app.get("/usage/stats", (_req, res) => {
  res.json({ ok: true, stats: { totalRequests, totalErrors, actors: actorStats.size, endpoints: endpointCounts.size, quotaLimit: QUOTA_LIMIT, startedAt, fetchedAt: new Date().toISOString() } });
});

/**
 * GET /quota/:actorId
 * Check quota status for a specific actor.
 */
app.get("/quota/:actorId", (req, res) => {
  const stats = actorStats.get(req.params.actorId);
  const used = stats?.requests || 0;
  const remaining = Math.max(0, QUOTA_LIMIT - used);
  const exceeded = used >= QUOTA_LIMIT;
  res.json({
    ok: true,
    actorId: req.params.actorId,
    quotaLimit: QUOTA_LIMIT,
    quotaUsed: used,
    quotaRemaining: remaining,
    exceeded,
  });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[usage-service] Listening on port ${PORT}`);
  console.log(`[usage-service] PROM=${PROM_URL} QUOTA_LIMIT=${QUOTA_LIMIT}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exit(1);
});
process.on("SIGTERM", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
