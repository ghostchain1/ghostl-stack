import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7632);
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


// In-memory explanation log (recent analysis requests)
const explanationLog = new Map(); // id → explanation

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "explainability-service", count: explanationLog.size }));

/** GET /explain — live metric-backed explanation snapshot */
app.get("/explain", async (req, res) => {
  try {
    const [riskResp, congestionResp, anomalyResp] = await Promise.all([
      promQuery("ai_monitor_risk_score"),
      promQuery("ai_monitor_congestion_score"),
      promQuery("ai_anomaly_detected_total"),
    ]);
    const risk = riskResp?.data?.result?.[0]?.value?.[1];
    const congestion = congestionResp?.data?.result?.[0]?.value?.[1];
    const anomalies = anomalyResp?.data?.result?.[0]?.value?.[1];
    const explanations = [];
    if (risk != null) {
      explanations.push({ id: "risk", metric: "ai_monitor_risk_score", value: risk,
        reasons: [Number(risk) > 75 ? "Elevated risk — reduce validator count or review pending transactions" : "Risk within acceptable range"],
        severity: Number(risk) > 75 ? "high" : Number(risk) > 40 ? "medium" : "low",
      });
    }
    if (congestion != null) {
      explanations.push({ id: "congestion", metric: "ai_monitor_congestion_score", value: congestion,
        reasons: [Number(congestion) > 75 ? "High congestion — consider raising gas price or wait for mempool to drain" : "Network operating normally"],
        severity: Number(congestion) > 75 ? "high" : "low",
      });
    }
    if (anomalies != null) {
      explanations.push({ id: "anomalies", metric: "ai_anomaly_detected_total", value: anomalies,
        reasons: [`${anomalies} anomalies detected by AI monitor`],
        severity: Number(anomalies) > 0 ? "warning" : "none",
      });
    }
    const entity = req.query.entity;
    res.json({ ok: true, explanations: entity ? explanations.filter((e) => e.id === entity) : explanations });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** POST /explain — submit a custom metric value for AI-driven explanation */
app.post("/explain", (req, res) => {
  const { metric, value, context } = req.body || {};
  if (!metric || value == null) return res.status(400).json({ ok: false, error: "metric and value required" });
  const score = Number(value);
  const severity = score > 75 ? "high" : score > 40 ? "medium" : "low";
  const explanation = {
    id: crypto.randomUUID(),
    metric,
    value: score,
    context: context || {},
    severity,
    reasons: [`${metric} = ${score} classified as ${severity}`],
    createdAt: Date.now(),
  };
  explanationLog.set(explanation.id, explanation);
  res.status(201).json({ ok: true, explanation });
});

/** GET /explain/stats — explanation counts by severity */
app.get("/explain/stats", (req, res) => {
  const all = [...explanationLog.values()];
  const bySeverity = {};
  for (const e of all) {
    const s = e.severity || "unknown";
    bySeverity[s] = (bySeverity[s] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, bySeverity, fetchedAt: new Date().toISOString() } });
});

/** GET /explain/history — recent custom explanation requests */
app.get("/explain/history", (req, res) => {
  const items = [...explanationLog.values()].sort((a, b) => b.createdAt - a.createdAt);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ ok: true, total: explanationLog.size, history: items.slice(0, limit) });
});

/** GET /explain/:entityId — look up a specific explanation by ID */
app.get("/explain/:entityId", (req, res) => {
  const e = explanationLog.get(req.params.entityId);
  if (!e) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, explanation: e });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[explainability-service] listening on :${PORT}, PROM=${PROM_URL}`);
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
