import express from "express";

const PORT = Number(process.env.PORT || 7615);
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "fee-model-service" }));

app.get("/fees", async (_req, res) => {
  try {
    const baseResp = await promQuery("gas_base_fee");
    const targetResp = await promQuery("gas_target_price");
    const base = baseResp?.data?.result?.[0]?.value?.[1] || null;
    const target = targetResp?.data?.result?.[0]?.value?.[1] || null;
    res.json({ ok: true, base, target });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// /model is the canonical endpoint consumed by the API layer.
// Returns { baseFee, targetGas, mode } shape expected by TokenomicsSummarySchema.
app.get("/model", async (_req, res) => {
  try {
    const [baseResp, targetResp, modeResp] = await Promise.all([
      promQuery("gas_base_fee"),
      promQuery("gas_target_gas"),
      promQuery("gas_price_model_mode"),
    ]);
    const baseFee = baseResp?.data?.result?.[0]?.value?.[1] || null;
    const targetGas = targetResp?.data?.result?.[0]?.value?.[1] || null;
    const modeMetric = modeResp?.data?.result?.[0]?.metric?.mode || null;
    const mode = modeMetric || process.env.GAS_PRICE_MODEL || "auto";
    res.json({ ok: true, baseFee, targetGas, mode });
  } catch (e) {
    // Fall back to env-configured defaults rather than erroring
    const mode = process.env.GAS_PRICE_MODEL || "auto";
    res.json({ ok: true, baseFee: null, targetGas: null, mode });
  }
});

app.listen(PORT, () => {
  console.log(`[fee-model-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
