import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7617);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
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
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


// In-memory custom forecast store
const forecastStore = new Map(); // id → forecast

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "forecasting-service", count: forecastStore.size }));

/** GET /forecast — live Prometheus-based congestion + risk forecast */
app.get("/forecast", async (req, res) => {
  try {
    const [congestionResp, riskResp, blockRateResp] = await Promise.all([
      promQuery("ai_monitor_congestion_score"),
      promQuery("ai_monitor_risk_score"),
      promQuery("rate(ghost_blockNumber[10m])"),
    ]);
    const congestion = Number(congestionResp?.data?.result?.[0]?.value?.[1] || 0);
    const risk = Number(riskResp?.data?.result?.[0]?.value?.[1] || 0);
    const blockRate = Number(blockRateResp?.data?.result?.[0]?.value?.[1] || 0);
    const horizon = req.query.horizon || "5m";
    res.json({
      ok: true,
      horizon,
      forecasts: [
        { metric: "congestion", horizon, value: congestion, trend: congestion > 60 ? "rising" : "stable", confidence: 0.6 },
        { metric: "risk", horizon, value: risk, trend: risk > 50 ? "rising" : "stable", confidence: 0.55 },
        { metric: "blockRate", horizon, value: blockRate.toFixed(4), trend: "stable", confidence: 0.8 },
      ],
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** POST /forecasts — submit a custom forecast entry */
app.post("/forecasts", (req, res) => {
  const { metric, horizon, value, confidence, trend, metadata } = req.body || {};
  if (!metric || value == null) return res.status(400).json({ ok: false, error: "metric and value required" });
  const entry = {
    id: crypto.randomUUID(),
    metric,
    horizon: horizon || "5m",
    value: Number(value),
    confidence: confidence != null ? Number(confidence) : null,
    trend: trend || "unknown",
    metadata: metadata || {},
    createdAt: Date.now(),
  };
  forecastStore.set(entry.id, entry);
  res.status(201).json({ ok: true, forecast: entry });
});

/** GET /forecasts — list custom forecast entries */
app.get("/forecasts", (req, res) => {
  let items = [...forecastStore.values()].sort((a, b) => b.createdAt - a.createdAt);
  if (req.query.metric) items = items.filter((f) => f.metric === req.query.metric);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ ok: true, total: forecastStore.size, forecasts: items.slice(0, limit) });
});

/** GET /forecasts/stats — aggregate forecast counts by metric */
app.get("/forecasts/stats", (req, res) => {
  const all = [...forecastStore.values()];
  const byMetric = {};
  for (const f of all) {
    byMetric[f.metric] = (byMetric[f.metric] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, byMetric, fetchedAt: new Date().toISOString() } });
});

/** GET /forecasts/:id — look up a specific stored forecast */
app.get("/forecasts/:id", (req, res) => {
  const f = forecastStore.get(req.params.id);
  if (!f) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, forecast: f });
});


app.delete("/forecasts/:id", (req, res) => {
  if (!forecastStore.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  forecastStore.delete(req.params.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[forecasting-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
