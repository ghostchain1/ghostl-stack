import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7661);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

// In-memory dispute store
const disputes = new Map(); // id → dispute

const VALID_STATUSES = ["open", "investigating", "resolved", "dismissed"];

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "dispute-service", count: disputes.size }));

/** List disputes filtered by ?status= */
app.get("/disputes", async (req, res) => {
  try {
    const [mismatchResp, challengesResp] = await Promise.all([
      promQuery("ghost_rollup_challenger_mismatches_total"),
      promQuery("ghost_rollup_challenger_challenges_sent_total"),
    ]);
    let items = [...disputes.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (req.query.status) items = items.filter((d) => d.status === req.query.status);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    res.json({
      ok: true,
      total: disputes.size,
      disputes: items.slice(offset, offset + limit),
      stats: {
        mismatches: mismatchResp?.data?.result?.[0]?.value?.[1] || "0",
        challenges: challengesResp?.data?.result?.[0]?.value?.[1] || "0",
      },
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

app.get("/disputes/:id", (req, res) => {
  const d = disputes.get(req.params.id);
  if (!d) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, dispute: d });
});

/** Open a new dispute */
app.post("/disputes", (req, res) => {
  const { challenger, outputRoot, blockNumber, reason, metadata } = req.body || {};
  if (!challenger) return res.status(400).json({ ok: false, error: "challenger required" });
  const d = {
    id: crypto.randomUUID(),
    challenger,
    outputRoot: outputRoot || null,
    blockNumber: blockNumber || null,
    reason: reason || "state_mismatch",
    metadata: metadata || {},
    status: "open",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resolvedAt: null,
    resolution: null,
  };
  disputes.set(d.id, d);
  res.status(201).json({ ok: true, dispute: d });
});

/** Advance dispute status */
app.post("/disputes/:id/status", (req, res) => {
  const d = disputes.get(req.params.id);
  if (!d) return res.status(404).json({ ok: false, error: "not_found" });
  const { status, resolution } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  d.status = status;
  d.updatedAt = Date.now();
  if ((status === "resolved" || status === "dismissed") && !d.resolvedAt) {
    d.resolvedAt = Date.now();
    d.resolution = resolution || status;
  }
  res.json({ ok: true, dispute: d });
});

app.delete("/disputes/:id", (req, res) => {
  if (!disputes.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  disputes.delete(req.params.id);
  res.json({ ok: true });
});

/** GET /disputes/stats — aggregate dispute counts by status */
app.get("/disputes/stats", (req, res) => {
  const all = [...disputes.values()];
  const byStatus = {};
  for (const d of all) {
    const s = d.status || "open";
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, byStatus, fetchedAt: new Date().toISOString() } });
});


app.listen(PORT, () => {
  console.log(`[dispute-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
