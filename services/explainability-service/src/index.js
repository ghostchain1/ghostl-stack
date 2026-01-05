import express from "express";

const PORT = Number(process.env.PORT || 7632);
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "explainability-service" }));

app.get("/explain", async (_req, res) => {
  try {
    const riskResp = await promQuery("ai_monitor_risk_score");
    const risk = riskResp?.data?.result?.[0]?.value?.[1] || null;
    res.json({
      ok: true,
      explanations: risk ? [{ id: "risk", metric: "risk", value: risk, reasons: ["AI monitor risk score"] }] : []
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[explainability-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
