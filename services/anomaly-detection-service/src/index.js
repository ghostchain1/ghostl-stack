import express from "express";
import crypto from "node:crypto";

const PORT      = Number(process.env.PORT || 7616);
const PROM_URL  = process.env.PROMETHEUS_URL || "http://localhost:9090";
const THRESHOLD = Number(process.env.ANOMALY_THRESHOLD || 75);

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
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id })));
  next();
});


// In-memory anomaly log
const anomalyLog = new Map(); // id → anomaly

async function promQuery(q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(
      `${PROM_URL}/api/v1/query?query=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { return []; } finally { clearTimeout(timer); }
}

function toFloat(v) { return parseFloat(v?.[1] ?? "0") || 0; }

// Derive system-detected anomalies from Prometheus
async function detectFromProm() {
  const [riskRaw, congRaw, slashRaw] = await Promise.all([
    promQuery("ghost_contract_risk_score"),
    promQuery("ghost_mempool_congestion_ratio"),
    promQuery("ghost_validator_slashings_total"),
  ]);
  const detected = [];
  for (const r of riskRaw) {
    const score = toFloat(r.value) * 100;
    if (score > THRESHOLD)
      detected.push({ src: "prometheus", entity: r.metric?.contract || r.metric?.address || "unknown", metric: "contract_risk_score", score, severity: score > 90 ? "critical" : "high" });
  }
  for (const r of congRaw) {
    const score = toFloat(r.value) * 100;
    if (score > THRESHOLD)
      detected.push({ src: "prometheus", entity: r.metric?.instance || "mempool", metric: "mempool_congestion", score, severity: score > 90 ? "critical" : "high" });
  }
  for (const r of slashRaw) {
    const count = toFloat(r.value);
    if (count > 0)
      detected.push({ src: "prometheus", entity: r.metric?.validator || "unknown", metric: "validator_slashings", score: Math.min(count * 20, 100), severity: count >= 3 ? "critical" : "medium" });
  }
  return detected;
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "anomaly-detection-service", threshold: THRESHOLD, loggedCount: anomalyLog.size }));

/** GET /anomalies — merged list of in-memory + Prometheus-detected */
app.get("/anomalies", async (req, res) => {
  const { severity, entity, since, source } = req.query;
  const fromProm = await detectFromProm();
  let all = [
    ...anomalyLog.values(),
    ...fromProm.map((a) => ({ id: null, ...a, timestamp: new Date().toISOString() })),
  ];
  if (severity) all = all.filter((a) => a.severity === severity);
  if (entity)   all = all.filter((a) => String(a.entity || "").includes(entity));
  if (source)   all = all.filter((a) => (a.src || a.source) === source);
  if (since) {
    const sinceTs = new Date(since).getTime();
    all = all.filter((a) => a.timestamp && new Date(a.timestamp).getTime() >= sinceTs);
  }
  res.json({ ok: true, count: all.length, threshold: THRESHOLD, anomalies: all });
});

/** GET /anomalies/stats — counts by severity and entity */
app.get("/anomalies/stats", async (req, res) => {
  const fromProm = await detectFromProm();
  const all = [...anomalyLog.values(), ...fromProm];
  const bySeverity = {};
  const byEntity   = {};
  for (const a of all) {
    const sev = a.severity || "unknown";
    const ent = a.entity   || "unknown";
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    byEntity[ent]   = (byEntity[ent]   || 0) + 1;
  }
  const criticalCount = bySeverity["critical"] || 0;
  res.json({ ok: true, total: all.length, criticalCount, bySeverity, byEntity, threshold: THRESHOLD });
});

/** GET /anomalies/:id — fetch a manually registered anomaly */
app.get("/anomalies/:id", (req, res) => {
  const anomaly = anomalyLog.get(req.params.id);
  if (!anomaly) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, anomaly });
});

/** POST /anomalies — register an anomaly manually */
app.post("/anomalies", (req, res) => {
  const { entity, metric, score, reasons, severity, src } = req.body || {};
  if (!entity || !metric) return res.status(400).json({ ok: false, error: "entity and metric are required" });
  const numScore = Number(score) || 0;
  const id = crypto.randomUUID();
  const anomaly = {
    id,
    entity,
    metric,
    score: numScore,
    severity: severity || (numScore >= 90 ? "critical" : numScore >= THRESHOLD ? "high" : "medium"),
    reasons: reasons || [],
    src: src || "manual",
    timestamp: new Date().toISOString(),
  };
  anomalyLog.set(id, anomaly);
  res.status(201).json({ ok: true, anomaly });
});

/** DELETE /anomalies/:id — remove a manually registered anomaly */
app.delete("/anomalies/:id", (req, res) => {
  if (!anomalyLog.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  anomalyLog.delete(req.params.id);
  res.json({ ok: true });
});

/** PATCH /anomalies/:id — update severity/reasons */
app.patch("/anomalies/:id", (req, res) => {
  const anomaly = anomalyLog.get(req.params.id);
  if (!anomaly) return res.status(404).json({ ok: false, error: "not_found" });
  const { severity, reasons, score } = req.body || {};
  if (severity) anomaly.severity = severity;
  if (reasons)  anomaly.reasons  = reasons;
  if (score != null) anomaly.score = Number(score);
  anomaly.updatedAt = new Date().toISOString();
  anomalyLog.set(req.params.id, anomaly);
  res.json({ ok: true, anomaly });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[anomaly-detection-service] listening on :${PORT}, threshold=${THRESHOLD}`);
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
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
