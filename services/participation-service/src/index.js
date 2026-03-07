import express from "express";

const PORT     = Number(process.env.PORT || 7603);
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

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "participation-service" })
);

/** GET /participation — all validator participation data */
app.get("/participation", async (_req, res) => {
  const [missedRes, proposedRes, byzantineRes] = await Promise.all([
    promQuery("ghost_validator_missed_blocks_total"),
    promQuery("ghost_validator_proposed_blocks_total"),
    promQuery("ghost_validator_byzantine_faults_total"),
  ]);

  const byValidator = {};
  const collect = (results, key) => {
    for (const r of results) {
      const v = r.metric?.validator || r.metric?.instance || "unknown";
      if (!byValidator[v]) byValidator[v] = { validator: v, missed: 0, proposed: 0, byzantine: 0 };
      byValidator[v][key] = toFloat(r.value);
    }
  };
  collect(missedRes,    "missed");
  collect(proposedRes,  "proposed");
  collect(byzantineRes, "byzantine");

  const validators = Object.values(byValidator).map((v) => ({
    ...v,
    participationRate: v.proposed + v.missed > 0
      ? Math.round((v.proposed / (v.proposed + v.missed)) * 10000) / 100
      : null,
  }));

  res.json({ ok: true, count: validators.length, validators });
});

/** GET /participation/stats — aggregate rates */
app.get("/participation/stats", async (_req, res) => {
  const [missedRes, proposedRes, totalRes] = await Promise.all([
    promQuery("sum(ghost_validator_missed_blocks_total)"),
    promQuery("sum(ghost_validator_proposed_blocks_total)"),
    promQuery("count(ghost_validator_proposed_blocks_total)"),
  ]);

  const totalMissed   = toFloat(missedRes[0]?.value);
  const totalProposed = toFloat(proposedRes[0]?.value);
  const validatorCount = toFloat(totalRes[0]?.value);
  const totalBlocks   = totalProposed + totalMissed;
  const overallRate   = totalBlocks > 0 ? Math.round((totalProposed / totalBlocks) * 10000) / 100 : null;

  res.json({
    ok: true,
    validatorCount,
    totalProposed,
    totalMissed,
    overallParticipationRate: overallRate,
    ts: new Date().toISOString(),
  });
});

/** GET /participation/range?validator=X&start=&end=&step= */
app.get("/participation/range", async (req, res) => {
  const { validator, start, end, step = "300s" } = req.query;
  if (!start || !end) return res.status(400).json({ ok: false, error: "start and end required" });
  const labelFilter = validator ? `{validator="${validator}"}` : "";
  const [missedSeries, proposedSeries] = await Promise.all([
    promRange(`ghost_validator_missed_blocks_total${labelFilter}`, start, end, step),
    promRange(`ghost_validator_proposed_blocks_total${labelFilter}`, start, end, step),
  ]);
  res.json({ ok: true, missed: missedSeries, proposed: proposedSeries });
});

/** GET /participation/:validator — individual validator data */
app.get("/participation/:validator", async (req, res) => {
  const v = req.params.validator;
  const label = `validator="${v}"`;
  const [missedRes, proposedRes, byzantineRes] = await Promise.all([
    promQuery(`ghost_validator_missed_blocks_total{${label}}`),
    promQuery(`ghost_validator_proposed_blocks_total{${label}}`),
    promQuery(`ghost_validator_byzantine_faults_total{${label}}`),
  ]);
  const missed    = toFloat(missedRes[0]?.value);
  const proposed  = toFloat(proposedRes[0]?.value);
  const byzantine = toFloat(byzantineRes[0]?.value);
  const total = proposed + missed;
  res.json({
    ok: true,
    validator: v,
    proposed,
    missed,
    byzantine,
    participationRate: total > 0 ? Math.round((proposed / total) * 10000) / 100 : null,
    ts: new Date().toISOString(),
  });
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[participation-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
