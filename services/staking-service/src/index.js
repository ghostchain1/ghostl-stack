import express from "express";

const PORT     = Number(process.env.PORT || 7601);
const PROM_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

async function promQuery(q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(
      `${PROM_URL}/api/v1/query?query=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { return []; } finally { clearTimeout(timer); }
}

async function promRange(q, start, end, step = "60s") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const params = new URLSearchParams({ query: q, start, end, step });
  try {
    const r = await fetch(`${PROM_URL}/api/v1/query_range?${params}`, { signal: controller.signal });
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { return []; } finally { clearTimeout(timer); }
}

function toFloat(v) { return parseFloat(v?.[1] ?? "0") || 0; }

app.get("/health", (_req, res) => res.json({ ok: true, service: "staking-service" }));

/** GET /stake — all delegations */
app.get("/stake", async (_req, res) => {
  const [stakeRes, commRes, statusRes] = await Promise.all([
    promQuery("ghost_validator_total_stake"),
    promQuery("ghost_validator_commission_rate"),
    promQuery("ghost_validator_active"),
  ]);

  const byValidator = {};
  const collect = (results, key) => {
    for (const r of results) {
      const v = r.metric?.validator || r.metric?.instance || "unknown";
      if (!byValidator[v]) byValidator[v] = { validator: v, totalStake: 0, commissionRate: 0, active: false };
      byValidator[v][key] = key === "active" ? toFloat(r.value) === 1 : toFloat(r.value);
    }
  };
  collect(stakeRes,   "totalStake");
  collect(commRes,    "commissionRate");
  collect(statusRes,  "active");

  const delegations = Object.values(byValidator).sort((a, b) => b.totalStake - a.totalStake);
  res.json({ ok: true, count: delegations.length, delegations });
});

/** GET /stake/stats — aggregate staking statistics */
app.get("/stake/stats", async (_req, res) => {
  const [sumRes, avgCommRes, activeRes] = await Promise.all([
    promQuery("sum(ghost_validator_total_stake)"),
    promQuery("avg(ghost_validator_commission_rate)"),
    promQuery("sum(ghost_validator_active)"),
  ]);
  const totalStake      = toFloat(sumRes[0]?.value);
  const avgCommission   = toFloat(avgCommRes[0]?.value);
  const activeValidators = toFloat(activeRes[0]?.value);
  res.json({
    ok: true,
    totalStake,
    avgCommissionRate: Math.round(avgCommission * 10000) / 10000,
    activeValidatorCount: activeValidators,
    ts: new Date().toISOString(),
  });
});

/** GET /stake/range?validator=X&start=&end=&step= — historical stake data */
app.get("/stake/range", async (req, res) => {
  const { validator, start, end, step = "300s" } = req.query;
  if (!start || !end) return res.status(400).json({ ok: false, error: "start and end required" });
  const labelFilter = validator ? `{validator="${validator}"}` : "";
  const [stakeSeries, activeCountSeries] = await Promise.all([
    promRange(`ghost_validator_total_stake${labelFilter}`, start, end, step),
    promRange(`sum(ghost_validator_active)`, start, end, step),
  ]);
  res.json({ ok: true, stake: stakeSeries, activeCount: activeCountSeries });
});

/** GET /stake/:validator — per-validator staking details */
app.get("/stake/:validator", async (req, res) => {
  const v = req.params.validator;
  const label = `validator="${v}"`;
  const [stakeRes, commRes, activeRes, slashRes] = await Promise.all([
    promQuery(`ghost_validator_total_stake{${label}}`),
    promQuery(`ghost_validator_commission_rate{${label}}`),
    promQuery(`ghost_validator_active{${label}}`),
    promQuery(`ghost_validator_slashings_total{${label}}`),
  ]);
  const totalStake     = toFloat(stakeRes[0]?.value);
  const commissionRate = toFloat(commRes[0]?.value);
  const active         = toFloat(activeRes[0]?.value) === 1;
  const slashings      = toFloat(slashRes[0]?.value);
  res.json({
    ok: true,
    validator: v,
    totalStake,
    commissionRate,
    active,
    slashings,
    ts: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[staking-service] listening on :${PORT}`);
});
