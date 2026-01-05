import express from "express";

const PORT = Number(process.env.PORT || 7617);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "forecasting-service" }));

app.get("/forecast", async (_req, res) => {
  try {
    const congestionResp = await promQuery("ai_monitor_congestion_score");
    const riskResp = await promQuery("ai_monitor_risk_score");
    const congestion = Number(congestionResp?.data?.result?.[0]?.value?.[1] || 0);
    const risk = Number(riskResp?.data?.result?.[0]?.value?.[1] || 0);
    res.json({
      ok: true,
      forecasts: [
        { metric: "congestion", horizon: "5m", value: congestion, confidence: 0.6 },
        { metric: "risk", horizon: "5m", value: risk, confidence: 0.5 }
      ]
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[forecasting-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
