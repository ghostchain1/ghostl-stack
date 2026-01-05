import express from "express";

const PORT = Number(process.env.PORT || 7609);
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "contract-risk-service" }));

app.get("/risk", async (_req, res) => {
  try {
    const riskResp = await promQuery("contracts_ai_risk_score");
    const revertResp = await promQuery("contracts_revert_rate");
    const risks = riskResp?.data?.result || [];
    const reverts = revertResp?.data?.result || [];
    const items = risks.map((r) => ({
      address: r.metric.address || r.metric.contract || "unknown",
      risk: r.value?.[1] || "0",
      revertRate:
        reverts.find((v) => v.metric.address === r.metric.address || v.metric.contract === r.metric.contract)?.value?.[1] ||
        "0"
    }));
    res.json({ ok: true, contracts: items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[contract-risk-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
