import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7605);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


// In-memory transfer store
const transfers = new Map(); // id → transfer

const VALID_STATUSES = ["pending", "relaying", "finalized", "failed", "rolled-back"];

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "transfer-lifecycle-service", count: transfers.size }));

/** List transfers with optional ?status=, ?srcChain=, ?dstChain= filters */
app.get("/transfers", async (req, res) => {
  try {
    const [pendingResp, finalizedResp] = await Promise.all([
      promQuery("ghost_relayer_pending_finalizations"),
      promQuery("ghost_relayer_finalize_success_total"),
    ]);
    let items = [...transfers.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (req.query.status) items = items.filter((t) => t.status === req.query.status);
    if (req.query.srcChain) items = items.filter((t) => t.srcChain === req.query.srcChain);
    if (req.query.dstChain) items = items.filter((t) => t.dstChain === req.query.dstChain);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    res.json({
      ok: true,
      total: transfers.size,
      transfers: items.slice(offset, offset + limit),
      stats: {
        pendingFinalizations: pendingResp?.data?.result?.[0]?.value?.[1] || "0",
        finalizedTotal: finalizedResp?.data?.result?.[0]?.value?.[1] || "0",
      },
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /transfers/stats — in-memory counts by status */
app.get("/transfers/stats", (_req, res) => {
  const all = [...transfers.values()];
  const byStatus = {};
  for (const t of all) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  res.json({ ok: true, stats: { total: all.length, byStatus, fetchedAt: new Date().toISOString() } });
});


app.get("/transfers/:id", (req, res) => {
  const t = transfers.get(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, transfer: t });
});

/** Register a new cross-chain transfer */
app.post("/transfers", (req, res) => {
  const { srcChain, dstChain, amount, token, sender, recipient, txHash } = req.body || {};
  if (!srcChain || !dstChain || !amount) {
    return res.status(400).json({ ok: false, error: "srcChain, dstChain, and amount required" });
  }
  const t = {
    id: crypto.randomUUID(),
    srcChain,
    dstChain,
    amount: String(amount),
    token: token || "native",
    sender: sender || null,
    recipient: recipient || null,
    txHash: txHash || null,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    finalizedAt: null,
    txs: txHash ? [txHash] : [],
  };
  transfers.set(t.id, t);
  res.status(201).json({ ok: true, transfer: t });
});

/** Advance transfer lifecycle status */
app.post("/transfers/:id/status", (req, res) => {
  const t = transfers.get(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: "not_found" });
  const { status, txHash } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  t.status = status;
  t.updatedAt = Date.now();
  if (txHash && !t.txs.includes(txHash)) t.txs.push(txHash);
  if (status === "finalized" && !t.finalizedAt) t.finalizedAt = Date.now();
  res.json({ ok: true, transfer: t });
});

app.delete("/transfers/:id", (req, res) => {
  if (!transfers.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  transfers.delete(req.params.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[transfer-lifecycle-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
