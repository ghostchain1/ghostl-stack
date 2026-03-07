import express from "express";

const PORT = Number(process.env.PORT || 7610);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
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
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id })));
  next();
});


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

const promRange = async (query, start, end, step = "15s") => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `${PROM_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`prom ${r.status}`);
    return await r.json();
  } catch (e) { clearTimeout(t); throw e; }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "mempool-service", prom: PROM_URL }));

/** GET /mempool — current snapshot: pending + queued + evicted */
app.get("/mempool", async (_req, res) => {
  try {
    const [pendingResp, queuedResp, evictedResp] = await Promise.all([
      promQuery("txpool_pending_total"),
      promQuery("txpool_queued_total"),
      promQuery("txpool_evictions_total"),
    ]);
    res.json({
      ok: true,
      pending: pendingResp?.data?.result?.[0]?.value?.[1] || "0",
      queued: queuedResp?.data?.result?.[0]?.value?.[1] || "0",
      evictions: evictedResp?.data?.result?.[0]?.value?.[1] || "0",
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /mempool/range?start=&end=&step= — pending count over time */
app.get("/mempool/range", async (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const end = Number(req.query.end) || now;
  const start = Number(req.query.start) || end - 3600;
  const step = req.query.step || "30s";
  try {
    const r = await promRange("txpool_pending_total", start, end, step);
    res.json({ ok: true, range: r?.data?.result || [] });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /mempool/stats — aggregated ingestion rate + congestion indicator */
app.get("/mempool/stats", async (_req, res) => {
  try {
    const [pendingResp, ingressResp] = await Promise.all([
      promQuery("txpool_pending_total"),
      promQuery("rate(txpool_ingress_total[5m])"),
    ]);
    const pending = Number(pendingResp?.data?.result?.[0]?.value?.[1] || 0);
    const ingress = Number(ingressResp?.data?.result?.[0]?.value?.[1] || 0);
    const congested = pending > 1000;
    res.json({ ok: true, pending, ingressRate: ingress.toFixed(4), congested });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /mempool/:layer — mempool snapshot for a specific chain layer */
app.get("/mempool/:layer", async (req, res) => {
  const { layer } = req.params;
  try {
    const [pendingResp, queuedResp] = await Promise.all([
      promQuery(`txpool_pending_total{layer="${layer}"}`),
      promQuery(`txpool_queued_total{layer="${layer}"}`),
    ]);
    const pending = pendingResp?.data?.result || [];
    if (!pending.length && !(queuedResp?.data?.result || []).length) {
      res.status(404).json({ ok: false, error: "layer_not_found_or_no_data", layer });
      return;
    }
    res.json({
      ok: true,
      layer,
      pending: pending[0]?.value?.[1] || "0",
      queued: (queuedResp?.data?.result || [])[0]?.value?.[1] || "0",
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});


app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[mempool-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
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
