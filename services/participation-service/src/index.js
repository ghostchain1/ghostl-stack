import express from "express";

const PORT = Number(process.env.PORT || 7603);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "participation-service" }));

app.get("/participation", async (_req, res) => {
  try {
    const missedResp = await promQuery("validator_missed_blocks_total");
    const proposerResp = await promQuery("validator_proposer_rank");
    const byzantineResp = await promQuery("byzantine_alerts_total");
    const missed = missedResp?.data?.result || [];
    const proposer = proposerResp?.data?.result || [];
    const byzantine = byzantineResp?.data?.result || [];
    res.json({
      ok: true,
      validators: {
        missed,
        proposer,
        byzantine
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[participation-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
