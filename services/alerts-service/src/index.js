import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7644);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json({ limit: "256kb" }));

// In-memory alert log
const alertLog = new Map(); // id → alert

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "alerts-service", count: alertLog.size }));

/** List alerts (in-memory log + Prometheus stats) */
app.get("/alerts", async (req, res) => {
  try {
    const [guardResp, challengerResp] = await Promise.all([
      promQuery("ghost_guard_alerts_total"),
      promQuery("ghost_rollup_challenger_errors_total"),
    ]);
    let items = [...alertLog.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (req.query.severity) items = items.filter((a) => a.severity === req.query.severity);
    if (req.query.resolved !== undefined) {
      const want = req.query.resolved === "true";
      items = items.filter((a) => !!a.resolvedAt === want);
    }
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    res.json({
      ok: true,
      total: alertLog.size,
      alerts: items.slice(offset, offset + limit),
      stats: {
        guardAlerts: guardResp?.data?.result?.[0]?.value?.[1] || "0",
        challengerAlerts: challengerResp?.data?.result?.[0]?.value?.[1] || "0",
      },
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /alerts/stats — aggregate open/resolved counts and severity breakdown */
app.get("/alerts/stats", (req, res) => {
  const all = [...alertLog.values()];
  const open = all.filter((a) => !a.resolvedAt).length;
  const resolved = all.filter((a) => a.resolvedAt).length;
  const bySeverity = {};
  for (const a of all) {
    const s = a.severity || "unknown";
    bySeverity[s] = (bySeverity[s] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, open, resolved, bySeverity, fetchedAt: new Date().toISOString() } });
});

app.get("/alerts/:id", (req, res) => {
  const a = alertLog.get(req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, alert: a });
});

/** Create / fire a new alert */
app.post("/alerts", (req, res) => {
  const { name, severity, entity, message, metadata } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  const a = {
    id: crypto.randomUUID(),
    name,
    severity: severity || "warning",
    entity: entity || "system",
    message: message || name,
    metadata: metadata || {},
    resolvedAt: null,
    createdAt: Date.now(),
  };
  alertLog.set(a.id, a);
  res.status(201).json({ ok: true, alert: a });
});

/** Resolve an alert */
app.post("/alerts/:id/resolve", (req, res) => {
  const a = alertLog.get(req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: "not_found" });
  a.resolvedAt = Date.now();
  a.resolution = req.body?.resolution || "manual";
  res.json({ ok: true, alert: a });
});

app.delete("/alerts/:id", (req, res) => {
  if (!alertLog.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  alertLog.delete(req.params.id);
  res.json({ ok: true });
});


app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[alerts-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
