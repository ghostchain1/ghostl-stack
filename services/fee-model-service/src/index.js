import express from "express";

const PORT     = Number(process.env.PORT || 7615);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.set("case sensitive routing", true);
app.disable("x-powered-by");
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
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
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
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + _RL_WINDOW) / 1000));
  if (count > _RL_MAX) { res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); res.setHeader("RateLimit-Policy", `limit=${_RL_MAX};w=${Math.ceil(_RL_WINDOW / 1000)}`); return res.status(429).json({ error: "Too many requests" }); }
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


// Manual mode override (e.g. "eip1559", "fixed", "auto")
let modeOverride = null;

async function promQuery(q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(
      `${PROM_URL}/api/v1/query?query=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function promRange(q, start, end, step = "60s") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const params = new URLSearchParams({ query: q, start, end, step });
  try {
    const r = await fetch(`${PROM_URL}/api/v1/query_range?${params}`, { signal: controller.signal });
    clearTimeout(timer);
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { clearTimeout(timer); return []; }
}

function scalar(resp) {
  return resp?.data?.result?.[0]?.value?.[1] ?? null;
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "fee-model-service", modeOverride }));

/** GET /fees — base fee and target gas price (simple view) */
app.get("/fees", async (_req, res) => {
  try {
    const [baseResp, targetResp] = await Promise.all([
      promQuery("gas_base_fee"),
      promQuery("gas_target_price"),
    ]);
    res.json({ ok: true, base: scalar(baseResp), target: scalar(targetResp) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /model — canonical endpoint for TokenomicsSummarySchema */
app.get("/model", async (_req, res) => {
  try {
    const [baseResp, targetResp, modeResp, priorityResp, congResp] = await Promise.all([
      promQuery("gas_base_fee"),
      promQuery("gas_target_gas"),
      promQuery("gas_price_model_mode"),
      promQuery("gas_priority_fee"),
      promQuery("ghost_mempool_congestion_ratio"),
    ]);
    const baseFee    = scalar(baseResp);
    const targetGas  = scalar(targetResp);
    const priorityFee = scalar(priorityResp);
    const congestion  = scalar(congResp);
    const modeMetric = modeResp?.data?.result?.[0]?.metric?.mode ?? null;
    const mode = modeOverride || modeMetric || process.env.GAS_PRICE_MODEL || "auto";
    res.json({ ok: true, baseFee, targetGas, priorityFee, congestion, mode });
  } catch {
    const mode = modeOverride || process.env.GAS_PRICE_MODEL || "auto";
    res.json({ ok: true, baseFee: null, targetGas: null, priorityFee: null, congestion: null, mode });
  }
});

/** GET /fees/stats — aggregate fee statistics */
app.get("/fees/stats", async (_req, res) => {
  try {
    const [minResp, maxResp, avgResp, p95Resp] = await Promise.all([
      promQuery("min_over_time(gas_base_fee[1h])"),
      promQuery("max_over_time(gas_base_fee[1h])"),
      promQuery("avg_over_time(gas_base_fee[1h])"),
      promQuery("quantile_over_time(0.95, gas_base_fee[1h])"),
    ]);
    res.json({
      ok: true,
      window: "1h",
      minBaseFee: scalar(minResp),
      maxBaseFee: scalar(maxResp),
      avgBaseFee: scalar(avgResp),
      p95BaseFee: scalar(p95Resp),
      mode: modeOverride || process.env.GAS_PRICE_MODEL || "auto",
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /fees/range?start=&end=&step= — historical base fee time series */
app.get("/fees/range", async (req, res) => {
  const { start, end, step = "300s" } = req.query;
  if (!start || !end) return res.status(400).json({ ok: false, error: "start and end required" });
  const [baseFeeSeries, prioritySeries] = await Promise.all([
    promRange("gas_base_fee", start, end, step),
    promRange("gas_priority_fee", start, end, step),
  ]);
  res.json({ ok: true, baseFee: baseFeeSeries, priorityFee: prioritySeries });
});

/** PUT /model/config — override the gas price mode */
app.put("/model/config", (req, res) => {
  const { mode } = req.body || {};
  const valid = ["eip1559", "fixed", "legacy", "auto"];
  if (!mode || !valid.includes(mode)) {
    return res.status(400).json({ ok: false, error: `mode must be one of: ${valid.join(", ")}` });
  }
  modeOverride = mode;
  res.json({ ok: true, mode });
});

/** DELETE /model/config — clear the mode override */
app.delete("/model/config", (_req, res) => {
  modeOverride = null;
  res.json({ ok: true, mode: process.env.GAS_PRICE_MODEL || "auto" });
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[fee-model-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.on("connection", (socket) => socket.setNoDelay(true));
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exitCode = 1; process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGQUIT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
