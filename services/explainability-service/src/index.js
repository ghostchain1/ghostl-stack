import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7632);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

// In-memory explanation log (recent analysis requests)
const explanationLog = new Map(); // id → explanation

const promQuery = async (query) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`prom ${r.status}`);
    return await r.json();
  } catch (e) { clearTimeout(t); throw e; }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "explainability-service", count: explanationLog.size }));

/** GET /explain — live metric-backed explanation snapshot */
app.get("/explain", async (req, res) => {
  try {
    const [riskResp, congestionResp, anomalyResp] = await Promise.all([
      promQuery("ai_monitor_risk_score"),
      promQuery("ai_monitor_congestion_score"),
      promQuery("ai_anomaly_detected_total"),
    ]);
    const risk = riskResp?.data?.result?.[0]?.value?.[1];
    const congestion = congestionResp?.data?.result?.[0]?.value?.[1];
    const anomalies = anomalyResp?.data?.result?.[0]?.value?.[1];
    const explanations = [];
    if (risk != null) {
      explanations.push({ id: "risk", metric: "ai_monitor_risk_score", value: risk,
        reasons: [Number(risk) > 75 ? "Elevated risk — reduce validator count or review pending transactions" : "Risk within acceptable range"],
        severity: Number(risk) > 75 ? "high" : Number(risk) > 40 ? "medium" : "low",
      });
    }
    if (congestion != null) {
      explanations.push({ id: "congestion", metric: "ai_monitor_congestion_score", value: congestion,
        reasons: [Number(congestion) > 75 ? "High congestion — consider raising gas price or wait for mempool to drain" : "Network operating normally"],
        severity: Number(congestion) > 75 ? "high" : "low",
      });
    }
    if (anomalies != null) {
      explanations.push({ id: "anomalies", metric: "ai_anomaly_detected_total", value: anomalies,
        reasons: [`${anomalies} anomalies detected by AI monitor`],
        severity: Number(anomalies) > 0 ? "warning" : "none",
      });
    }
    const entity = req.query.entity;
    res.json({ ok: true, explanations: entity ? explanations.filter((e) => e.id === entity) : explanations });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** POST /explain — submit a custom metric value for AI-driven explanation */
app.post("/explain", (req, res) => {
  const { metric, value, context } = req.body || {};
  if (!metric || value == null) return res.status(400).json({ ok: false, error: "metric and value required" });
  const score = Number(value);
  const severity = score > 75 ? "high" : score > 40 ? "medium" : "low";
  const explanation = {
    id: crypto.randomUUID(),
    metric,
    value: score,
    context: context || {},
    severity,
    reasons: [`${metric} = ${score} classified as ${severity}`],
    createdAt: Date.now(),
  };
  explanationLog.set(explanation.id, explanation);
  res.status(201).json({ ok: true, explanation });
});

/** GET /explain/stats — explanation counts by severity */
app.get("/explain/stats", (req, res) => {
  const all = [...explanationLog.values()];
  const bySeverity = {};
  for (const e of all) {
    const s = e.severity || "unknown";
    bySeverity[s] = (bySeverity[s] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, bySeverity, fetchedAt: new Date().toISOString() } });
});

/** GET /explain/history — recent custom explanation requests */
app.get("/explain/history", (req, res) => {
  const items = [...explanationLog.values()].sort((a, b) => b.createdAt - a.createdAt);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ ok: true, total: explanationLog.size, history: items.slice(0, limit) });
});

/** GET /explain/:entityId — look up a specific explanation by ID */
app.get("/explain/:entityId", (req, res) => {
  const e = explanationLog.get(req.params.entityId);
  if (!e) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, explanation: e });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[explainability-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
