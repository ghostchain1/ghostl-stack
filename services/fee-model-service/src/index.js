import express from "express";

const PORT     = Number(process.env.PORT || 7615);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
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
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[fee-model-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
