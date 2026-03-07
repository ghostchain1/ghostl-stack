import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7661);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

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
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
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
    res.setHeader("Access-Control-Max-Age", "86400");
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
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


// In-memory dispute store
const disputes = new Map(); // id → dispute

const VALID_STATUSES = ["open", "investigating", "resolved", "dismissed"];

const promQuery = async (query) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`prom ${r.status}`);
    return await r.json();
  } catch (e) { clearTimeout(t); throw e; }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "dispute-service", count: disputes.size }));

/** List disputes filtered by ?status= */
app.get("/disputes", async (req, res) => {
  try {
    const [mismatchResp, challengesResp] = await Promise.all([
      promQuery("ghost_rollup_challenger_mismatches_total"),
      promQuery("ghost_rollup_challenger_challenges_sent_total"),
    ]);
    let items = [...disputes.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (req.query.status) items = items.filter((d) => d.status === req.query.status);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    res.json({
      ok: true,
      total: disputes.size,
      disputes: items.slice(offset, offset + limit),
      stats: {
        mismatches: mismatchResp?.data?.result?.[0]?.value?.[1] || "0",
        challenges: challengesResp?.data?.result?.[0]?.value?.[1] || "0",
      },
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /disputes/stats — aggregate dispute counts by status */
app.get("/disputes/stats", (req, res) => {
  const all = [...disputes.values()];
  const byStatus = {};
  for (const d of all) {
    const s = d.status || "open";
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, byStatus, fetchedAt: new Date().toISOString() } });
});

app.get("/disputes/:id", (req, res) => {
  const d = disputes.get(req.params.id);
  if (!d) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, dispute: d });
});

/** Open a new dispute */
app.post("/disputes", (req, res) => {
  const { challenger, outputRoot, blockNumber, reason, metadata } = req.body || {};
  if (!challenger) return res.status(400).json({ ok: false, error: "challenger required" });
  const d = {
    id: crypto.randomUUID(),
    challenger,
    outputRoot: outputRoot || null,
    blockNumber: blockNumber || null,
    reason: reason || "state_mismatch",
    metadata: metadata || {},
    status: "open",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resolvedAt: null,
    resolution: null,
  };
  disputes.set(d.id, d);
  res.status(201).json({ ok: true, dispute: d });
});

/** Advance dispute status */
app.post("/disputes/:id/status", (req, res) => {
  const d = disputes.get(req.params.id);
  if (!d) return res.status(404).json({ ok: false, error: "not_found" });
  const { status, resolution } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  d.status = status;
  d.updatedAt = Date.now();
  if ((status === "resolved" || status === "dismissed") && !d.resolvedAt) {
    d.resolvedAt = Date.now();
    d.resolution = resolution || status;
  }
  res.json({ ok: true, dispute: d });
});

app.delete("/disputes/:id", (req, res) => {
  if (!disputes.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  disputes.delete(req.params.id);
  res.json({ ok: true });
});


app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[dispute-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
