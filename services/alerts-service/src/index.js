import express from "express";

const PORT = Number(process.env.PORT || 7644);
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "alerts-service" }));

app.get("/alerts", async (_req, res) => {
  try {
    const guardResp = await promQuery("ghost_guard_alerts_total");
    const challengerResp = await promQuery("ghost_rollup_challenger_errors_total");
    const guardAlerts = guardResp?.data?.result?.[0]?.value?.[1] || "0";
    const challengerAlerts = challengerResp?.data?.result?.[0]?.value?.[1] || "0";
    res.json({
      ok: true,
      alerts: [],
      stats: { guardAlerts, challengerAlerts }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[alerts-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
