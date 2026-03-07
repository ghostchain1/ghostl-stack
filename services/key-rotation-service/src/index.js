import express from "express";
import crypto from "node:crypto";

const PORT     = Number(process.env.PORT || 7619);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json({ limit: "256kb" }));

// In-memory key rotation event log
const rotationLog = new Map(); // id → rotation event

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
  res.json({ ok: true, service: "key-rotation-service", prom: PROM_URL, logged: rotationLog.size })
);

/** GET /keys — Prometheus key rotation metrics */
app.get("/keys", async (_req, res) => {
  try {
    const [rotResp, pendingResp, lastResp] = await Promise.all([
      promQuery("validator_key_rotations_total"),
      promQuery("validator_key_rotations_pending"),
      promQuery("validator_key_last_rotation_timestamp"),
    ]);
    res.json({
      ok: true,
      rotations:       rotResp?.data?.result     || [],
      pending:         pendingResp?.data?.result || [],
      lastRotation:    lastResp?.data?.result    || [],
      recentEvents:    [...rotationLog.values()].slice(-20),
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /keys/stats — aggregated rotation stats */
app.get("/keys/stats", async (_req, res) => {
  try {
    const [totalResp, pendResp] = await Promise.all([
      promQuery("validator_key_rotations_total"),
      promQuery("validator_key_rotations_pending"),
    ]);
    res.json({
      ok: true,
      totalRotations: Number(totalResp?.data?.result?.[0]?.value?.[1] || 0),
      pending:        Number(pendResp?.data?.result?.[0]?.value?.[1]  || 0),
      loggedEvents:   rotationLog.size,
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** POST /keys/rotate — log a key rotation { validator, keyType, reason } */
app.post("/keys/rotate", (req, res) => {
  const { validator, keyType, reason } = req.body || {};
  if (!validator) return res.status(400).json({ ok: false, error: "validator required" });
  const event = {
    id: crypto.randomUUID(),
    validator,
    keyType:   keyType || "bls",
    reason:    reason  || "scheduled",
    rotatedAt: new Date().toISOString(),
    status:    "completed",
  };
  rotationLog.set(event.id, event);
  res.status(201).json({ ok: true, event });
});

/** GET /keys/:id — look up a specific key rotation event */
app.get("/keys/:id", (req, res) => {
  const event = rotationLog.get(req.params.id);
  if (!event) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, event });
});

/** DELETE /keys/:id — remove a logged key rotation event */
app.delete("/keys/:id", (req, res) => {
  if (!rotationLog.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  rotationLog.delete(req.params.id);
  res.json({ ok: true });
});

/** GET /keys/validator/:validator — all logged rotation events for a validator */
app.get("/keys/validator/:validator", (req, res) => {
  const events = [...rotationLog.values()].filter((e) => e.validator === req.params.validator);
  res.json({ ok: true, validator: req.params.validator, events });
});


app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[key-rotation-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
