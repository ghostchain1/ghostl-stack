import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7644);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
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
  res.removeHeader("Server");
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
  if (count > _RL_MAX) res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); return res.status(429).json({ error: "Too many requests" });
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${Date.now() - t0}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


// In-memory alert log
const alertLog = new Map(); // id → alert

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "alerts-service", count: alertLog.size }));

/** List alerts (in-memory log + Prometheus stats) */
app.get("/alerts", async (req, res) => {
  try {
    const [guardResp, challengerResp] = await Promise.all([
      promQuery("ghost_guard_alerts_total"),
      promQuery("ghost_rollup_challenger_errors_total"),
    ]);
    let items = [...alertLog.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (req.query.severity) items = items.filter((a) => a.severity === req.query.severity);
    if (req.query.resolved !== undefined) {
      const want = req.query.resolved === "true";
      items = items.filter((a) => !!a.resolvedAt === want);
    }
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    res.json({
      ok: true,
      total: alertLog.size,
      alerts: items.slice(offset, offset + limit),
      stats: {
        guardAlerts: guardResp?.data?.result?.[0]?.value?.[1] || "0",
        challengerAlerts: challengerResp?.data?.result?.[0]?.value?.[1] || "0",
      },
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /alerts/stats — aggregate open/resolved counts and severity breakdown */
app.get("/alerts/stats", (req, res) => {
  const all = [...alertLog.values()];
  const open = all.filter((a) => !a.resolvedAt).length;
  const resolved = all.filter((a) => a.resolvedAt).length;
  const bySeverity = {};
  for (const a of all) {
    const s = a.severity || "unknown";
    bySeverity[s] = (bySeverity[s] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, open, resolved, bySeverity, fetchedAt: new Date().toISOString() } });
});

app.get("/alerts/:id", (req, res) => {
  const a = alertLog.get(req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, alert: a });
});

/** Create / fire a new alert */
app.post("/alerts", (req, res) => {
  const { name, severity, entity, message, metadata } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  const a = {
    id: crypto.randomUUID(),
    name,
    severity: severity || "warning",
    entity: entity || "system",
    message: message || name,
    metadata: metadata || {},
    resolvedAt: null,
    createdAt: Date.now(),
  };
  alertLog.set(a.id, a);
  res.status(201).json({ ok: true, alert: a });
});

/** Resolve an alert */
app.post("/alerts/:id/resolve", (req, res) => {
  const a = alertLog.get(req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: "not_found" });
  a.resolvedAt = Date.now();
  a.resolution = req.body?.resolution || "manual";
  res.json({ ok: true, alert: a });
});

app.delete("/alerts/:id", (req, res) => {
  if (!alertLog.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  alertLog.delete(req.params.id);
  res.json({ ok: true });
});


app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[alerts-service] listening on :${PORT}, PROM=${PROM_URL}`);
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
