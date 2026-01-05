import express from "express";

const PORT = Number(process.env.PORT || 7628);
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "treasury-service" }));

app.get("/treasury", async (_req, res) => {
  try {
    const balResp = await promQuery("treasury_balance_total");
    const bal = balResp?.data?.result?.[0]?.value?.[1] || "0";
    res.json({ ok: true, balance: bal, txs: [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[treasury-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
