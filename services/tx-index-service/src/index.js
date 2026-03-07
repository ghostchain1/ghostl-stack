import express from "express";

const PORT     = Number(process.env.PORT || 7625);
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
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "tx-index-service", prom: PROM_URL }));

/** GET /txs — current tx counts per shard */
app.get("/txs", async (_req, res) => {
  try {
    const [txResp, failResp, pendingResp] = await Promise.all([
      promQuery("tx_count_total"),
      promQuery("tx_failed_total"),
      promQuery("tx_pending_count"),
    ]);
    res.json({
      ok: true,
      total:   txResp?.data?.result      || [],
      failed:  failResp?.data?.result    || [],
      pending: pendingResp?.data?.result || [],
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /txs/range?start=&end=&step= — tx rate over time */
app.get("/txs/range", async (req, res) => {
  const now   = Math.floor(Date.now() / 1000);
  const end   = Number(req.query.end)   || now;
  const start = Number(req.query.start) || end - 3600;
  const step  = req.query.step || "30s";
  try {
    const r = await promRange("rate(tx_count_total[5m])", start, end, step);
    res.json({ ok: true, tps: r?.data?.result || [] });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /txs/stats — aggregated tx stats */
app.get("/txs/stats", async (_req, res) => {
  try {
    const [totalResp, tpsResp, failResp] = await Promise.all([
      promQuery("tx_count_total"),
      promQuery("rate(tx_count_total[5m])"),
      promQuery("rate(tx_failed_total[5m])"),
    ]);
    res.json({
      ok: true,
      totalTxs:    Number(totalResp?.data?.result?.[0]?.value?.[1]  || 0),
      tps:         Number(tpsResp?.data?.result?.[0]?.value?.[1]   || 0).toFixed(4),
      failedTps:   Number(failResp?.data?.result?.[0]?.value?.[1]  || 0).toFixed(4),
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /txs/failed — failed transaction details per chain */
app.get("/txs/failed", async (_req, res) => {
  try {
    const [failResp, rateResp] = await Promise.all([
      promQuery("tx_failed_total"),
      promQuery("rate(tx_failed_total[5m])"),
    ]);
    res.json({
      ok: true,
      failed: failResp?.data?.result || [],
      failRate5m: rateResp?.data?.result?.[0]?.value?.[1] || "0",
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /txs/:layer — tx snapshot for a specific chain layer */
app.get("/txs/:layer", async (req, res) => {
  const { layer } = req.params;
  try {
    const [txResp, failResp] = await Promise.all([
      promQuery(`tx_count_total{layer="${layer}"}`),
      promQuery(`tx_failed_total{layer="${layer}"}`),
    ]);
    const txs = txResp?.data?.result || [];
    if (!txs.length) {
      res.status(404).json({ ok: false, error: "layer_not_found_or_no_data", layer });
      return;
    }
    res.json({
      ok: true,
      layer,
      total: txs[0]?.value?.[1] || "0",
      failed: (failResp?.data?.result || [])[0]?.value?.[1] || "0",
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});


app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[tx-index-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
