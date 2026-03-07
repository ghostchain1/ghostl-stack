import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7617);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

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

app.delete("/forecasts/:id", (req, res) => {
  if (!forecastStore.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  forecastStore.delete(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[forecasting-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
