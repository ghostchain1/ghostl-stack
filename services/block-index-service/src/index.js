import express from "express";

const PORT     = Number(process.env.PORT || 7626);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "block-index-service", prom: PROM_URL }));

/** GET /blocks — current block number per chain */
app.get("/blocks", async (_req, res) => {
  try {
    const [blockResp, timeResp, lagResp] = await Promise.all([
      promQuery("ghost_blockNumber"),
      promQuery("ghost_blockTime"),
      promQuery("finality_lag_blocks"),
    ]);
    res.json({
      ok: true,
      blockNumber: blockResp?.data?.result || [],
      blockTime:   timeResp?.data?.result  || [],
      finalityLag: lagResp?.data?.result   || [],
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /blocks/range?start=&end=&step= — block number over time */
app.get("/blocks/range", async (req, res) => {
  const now   = Math.floor(Date.now() / 1000);
  const end   = Number(req.query.end)   || now;
  const start = Number(req.query.start) || end - 3600;
  const step  = req.query.step || "30s";
  try {
    const r = await promRange("ghost_blockNumber", start, end, step);
    res.json({ ok: true, range: r?.data?.result || [] });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /blocks/stats — aggregated block stats */
app.get("/blocks/stats", async (_req, res) => {
  try {
    const [blockResp, rateResp] = await Promise.all([
      promQuery("ghost_blockNumber"),
      promQuery("rate(ghost_blockNumber[5m])"),
    ]);
    const latestBlock = Number(blockResp?.data?.result?.[0]?.value?.[1] || 0);
    const blockRate   = Number(rateResp?.data?.result?.[0]?.value?.[1]  || 0);
    res.json({ ok: true, latestBlock, blockRate: blockRate.toFixed(4) });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /blocks/:layer — block info for a specific chain layer (L1/L2/L3) */
app.get("/blocks/:layer", async (req, res) => {
  const { layer } = req.params;
  try {
    const [blockResp, timeResp] = await Promise.all([
      promQuery(`ghost_blockNumber{layer="${layer}"}`),
      promQuery(`ghost_blockTime{layer="${layer}"}`),
    ]);
    const blocks = blockResp?.data?.result || [];
    const times = timeResp?.data?.result || [];
    if (!blocks.length) {
      res.status(404).json({ ok: false, error: "layer_not_found_or_no_data", layer });
      return;
    }
    res.json({
      ok: true,
      layer,
      blockNumber: blocks[0]?.value?.[1] || null,
      blockTime: times[0]?.value?.[1] || null,
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});


app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[block-index-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
