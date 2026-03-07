import express from "express";

const PORT     = Number(process.env.PORT || 7609);
const PROM_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

// Manual risk overrides: address → { level, reason, setAt }
const overrides = new Map();

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

function toFloat(v) { return parseFloat(v?.[1] ?? "0") || 0; }
function scoreToLevel(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "contract-risk-service", overrideCount: overrides.size }));

/** GET /risk — all contract risk scores from Prometheus, with overrides applied */
app.get("/risk", async (_req, res) => {
  const [riskScores, upgradeFlags, proxyPaused] = await Promise.all([
    promQuery("ghost_contract_risk_score"),
    promQuery("ghost_contract_upgrade_pending"),
    promQuery("ghost_contract_paused"),
  ]);

  const byAddress = {};
  for (const r of riskScores) {
    const addr = r.metric?.contract || r.metric?.address || r.metric?.instance || "unknown";
    const score = Math.round(toFloat(r.value) * 100) / 100;
    byAddress[addr] = { address: addr, score, level: scoreToLevel(score), upgradePending: false, paused: false };
  }
  for (const r of upgradeFlags) {
    const addr = r.metric?.contract || r.metric?.address || "unknown";
    if (byAddress[addr]) byAddress[addr].upgradePending = toFloat(r.value) === 1;
  }
  for (const r of proxyPaused) {
    const addr = r.metric?.contract || r.metric?.address || "unknown";
    if (byAddress[addr]) byAddress[addr].paused = toFloat(r.value) === 1;
  }

  const contracts = Object.values(byAddress).map((c) => {
    const ov = overrides.get(c.address);
    return ov ? { ...c, level: ov.level, overridden: true, overrideReason: ov.reason } : c;
  });

  const { level, minScore, maxScore } = req?.query ?? {};
  let filtered = contracts;
  if (level)    filtered = filtered.filter((c) => c.level === level);
  if (minScore) filtered = filtered.filter((c) => c.score >= Number(minScore));
  if (maxScore) filtered = filtered.filter((c) => c.score <= Number(maxScore));

  res.json({ ok: true, count: filtered.length, contracts: filtered });
});

/** GET /risk/stats — aggregate risk statistics */
app.get("/risk/stats", async (_req, res) => {
  const results = await promQuery("ghost_contract_risk_score");
  const scores  = results.map((r) => toFloat(r.value) * 100);
  const total   = scores.length;
  const highRisk = scores.filter((s) => s >= 60).length;
  const criticalRisk = scores.filter((s) => s >= 80).length;
  const avgScore = total > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / total) * 100) / 100 : 0;
  const maxScore = total > 0 ? Math.max(...scores) : 0;
  res.json({ ok: true, total, highRisk, criticalRisk, avgScore, maxScore, overrideCount: overrides.size, ts: new Date().toISOString() });
});

/** GET /risk/:address — risk for a specific contract address */
app.get("/risk/:address", async (req, res) => {
  const addr = req.params.address;
  const [riskRes, upgradeRes, pausedRes] = await Promise.all([
    promQuery(`ghost_contract_risk_score{contract="${addr}"}`),
    promQuery(`ghost_contract_upgrade_pending{contract="${addr}"}`),
    promQuery(`ghost_contract_paused{contract="${addr}"}`),
  ]);
  const score = riskRes[0] ? Math.round(toFloat(riskRes[0].value) * 100) / 100 : null;
  const ov    = overrides.get(addr);
  res.json({
    ok: true,
    address: addr,
    score,
    level: ov ? ov.level : score != null ? scoreToLevel(score) : null,
    overridden: !!ov,
    overrideReason: ov?.reason ?? null,
    upgradePending: toFloat(upgradeRes[0]?.value) === 1,
    paused: toFloat(pausedRes[0]?.value) === 1,
    ts: new Date().toISOString(),
  });
});

/** POST /risk/overrides — set or update a manual risk level for an address */
app.post("/risk/overrides", (req, res) => {
  const { address, level, reason } = req.body || {};
  if (!address || !level) return res.status(400).json({ ok: false, error: "address and level are required" });
  const valid = ["low", "medium", "high", "critical"];
  if (!valid.includes(level)) return res.status(400).json({ ok: false, error: `level must be one of: ${valid.join(", ")}` });
  overrides.set(address, { address, level, reason: reason || "", setAt: new Date().toISOString() });
  res.status(201).json({ ok: true, override: overrides.get(address) });
});

/** DELETE /risk/overrides/:address — remove a manual override */
app.delete("/risk/overrides/:address", (req, res) => {
  if (!overrides.has(req.params.address)) return res.status(404).json({ ok: false, error: "not_found" });
  overrides.delete(req.params.address);
  res.json({ ok: true });
});

/** GET /risk/overrides — list all manual overrides */
app.get("/risk/overrides", (_req, res) => {
  res.json({ ok: true, count: overrides.size, overrides: [...overrides.values()] });
});

app.listen(PORT, () => {
  console.log(`[contract-risk-service] listening on :${PORT}`);
});
