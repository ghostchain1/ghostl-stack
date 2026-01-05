import express from "express";

const PORT = Number(process.env.PORT || 7604);
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "bridge-service" }));

app.get("/bridges", async (_req, res) => {
  try {
    const pendingResp = await promQuery("ghost_relayer_pending_finalizations");
    const finalizedResp = await promQuery("ghost_relayer_finalize_success_total");
    const pending = pendingResp?.data?.result?.[0]?.value?.[1] || "0";
    const finalized = finalizedResp?.data?.result?.[0]?.value?.[1] || "0";
    res.json({
      ok: true,
      bridges: [
        { id: "l2-l3", srcChain: "l2", dstChain: "l3", status: "live", pending, finalized },
        { id: "l3-l2", srcChain: "l3", dstChain: "l2", status: "live", pending, finalized }
      ]
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[bridge-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
