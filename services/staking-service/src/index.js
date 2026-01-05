import express from "express";

const PORT = Number(process.env.PORT || 7601);
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

app.get("/health", (_req, res) => res.json({ ok: true, service: "staking-service" }));

app.get("/stake", async (_req, res) => {
  try {
    const stakeResp = await promQuery("validator_stake_tokens");
    const commissionResp = await promQuery("validator_commission_rate");
    const stakes = stakeResp?.data?.result || [];
    const commissions = commissionResp?.data?.result || [];
    const totalStake = stakes.reduce((acc, s) => acc + Number(s.value?.[1] || 0), 0);
    const avgCommission =
      commissions.length > 0
        ? commissions.reduce((acc, s) => acc + Number(s.value?.[1] || 0), 0) / commissions.length
        : 0;
    const delegations = stakes.map((s) => ({
      validatorId: s.metric.validator || s.metric.address || "unknown",
      amount: s.value?.[1] || "0",
      commission:
        commissions.find((c) => c.metric.validator === s.metric.validator)?.value?.[1] ||
        commissions.find((c) => c.metric.address === s.metric.address)?.value?.[1] ||
        "0"
    }));
    res.json({ ok: true, totalStake, avgCommission, delegations });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[staking-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
