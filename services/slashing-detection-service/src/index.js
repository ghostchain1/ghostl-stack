import express from "express";
import crypto from "node:crypto";

const PORT     = Number(process.env.PORT || 7620);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

// In-memory log of manually reported slash events
const slashLog = new Map(); // id → event

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

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "slashing-detection-service", prom: PROM_URL, logged: slashLog.size })
);

/** GET /slashes — Prometheus slashing metrics + logged events */
app.get("/slashes", async (_req, res) => {
  try {
    const [slashResp, doubleSignResp, downtimeResp] = await Promise.all([
      promQuery("slashing_events_total"),
      promQuery("double_sign_events_total"),
      promQuery("downtime_slash_events_total"),
    ]);
    res.json({
      ok: true,
      totalSlashes:     slashResp?.data?.result       || [],
      doubleSign:       doubleSignResp?.data?.result  || [],
      downtimeSlashes:  downtimeResp?.data?.result    || [],
      recentEvents:     [...slashLog.values()].slice(-20),
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /slashes/stats — summary counts */
app.get("/slashes/stats", async (_req, res) => {
  try {
    const [totalResp, rateResp] = await Promise.all([
      promQuery("slashing_events_total"),
      promQuery("rate(slashing_events_total[1h])"),
    ]);
    res.json({
      ok: true,
      totalSlashes: Number(totalResp?.data?.result?.[0]?.value?.[1] || 0),
      slashRate1h:  Number(rateResp?.data?.result?.[0]?.value?.[1]  || 0).toFixed(6),
      loggedEvents: slashLog.size,
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** POST /slashes — log a slash event { validator, reason, epoch } */
app.post("/slashes", (req, res) => {
  const { validator, reason, epoch } = req.body || {};
  if (!validator) return res.status(400).json({ ok: false, error: "validator required" });
  const event = {
    id: crypto.randomUUID(),
    validator,
    reason: reason || "unknown",
    epoch: epoch ?? null,
    detectedAt: new Date().toISOString(),
  };
  slashLog.set(event.id, event);
  res.status(201).json({ ok: true, event });
});

/** GET /slashes/:id — look up a specific slash event */
app.get("/slashes/:id", (req, res) => {
  const event = slashLog.get(req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, event });
});

/** DELETE /slashes/:id — remove a logged slash event */
app.delete("/slashes/:id", (req, res) => {
  if (!slashLog.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  slashLog.delete(req.params.id);
  res.json({ ok: true });
});

/** GET /slashes/validator/:validator — all logged events for a validator */
app.get("/slashes/validator/:validator", (req, res) => {
  const events = [...slashLog.values()].filter((e) => e.validator === req.params.validator);
  res.json({ ok: true, validator: req.params.validator, events });
});


app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[slashing-detection-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
