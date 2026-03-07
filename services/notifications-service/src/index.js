import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7638);

const app = express();
app.use(express.json());

// In-memory notification store
const store = new Map(); // id → notification

// In-memory channel registry  (id → {id, type, target, meta})
const channels = new Map();

function makeId() { return crypto.randomUUID(); }

app.get("/health", (_req, res) => res.json({ ok: true, service: "notifications-service", count: store.size, channelCount: channels.size }));

// ── Channel registry ───────────────────────────────────────────────────────

app.get("/notifications/channels", (_req, res) => {
  res.json({ ok: true, channels: [...channels.values()] });
});

app.post("/notifications/channels", (req, res) => {
  const { type, target, meta } = req.body || {};
  if (!type || !target) return res.status(400).json({ ok: false, error: "type and target required" });
  const ch = { id: makeId(), type, target, meta: meta || {}, createdAt: Date.now() };
  channels.set(ch.id, ch);
  res.status(201).json({ ok: true, channel: ch });
});

app.get("/notifications/channels/:id", (req, res) => {
  const ch = channels.get(req.params.id);
  if (!ch) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, channel: ch });
});

app.delete("/notifications/channels/:id", (req, res) => {
  if (!channels.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  channels.delete(req.params.id);
  res.json({ ok: true });
});

// ── Notifications ──────────────────────────────────────────────────────────

/** List notifications with optional channel / status filter */
app.get("/notifications", (req, res) => {
  let items = [...store.values()].sort((a, b) => b.createdAt - a.createdAt);
  if (req.query.channel) items = items.filter((n) => n.channel === req.query.channel);
  if (req.query.status)  items = items.filter((n) => n.status === req.query.status);
  const limit  = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, total: store.size, notifications: items.slice(offset, offset + limit) });
});

/** GET /notifications/stats — counts by status and severity */
app.get("/notifications/stats", (_req, res) => {
  const all = [...store.values()];
  const byStatus = {};
  const bySeverity = {};
  for (const n of all) {
    byStatus[n.status] = (byStatus[n.status] || 0) + 1;
    const sev = n.severity || "info";
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, channels: channels.size, byStatus, bySeverity } });
});


/** Get a single notification */
app.get("/notifications/:id", (req, res) => {
  const n = store.get(req.params.id);
  if (!n) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, notification: n });
});

/** Create / register a new notification */
app.post("/notifications", (req, res) => {
  const { channel, message, severity, metadata } = req.body || {};
  if (!channel || !message) return res.status(400).json({ ok: false, error: "channel and message required" });
  const n = {
    id: makeId(),
    channel,
    message,
    severity: severity || "info",
    metadata: metadata || {},
    status: "pending",
    createdAt: Date.now(),
    deliveredAt: null,
  };
  store.set(n.id, n);
  res.status(201).json({ ok: true, notification: n });
});

/** Mark a notification as delivered */
app.post("/notifications/:id/deliver", (req, res) => {
  const n = store.get(req.params.id);
  if (!n) return res.status(404).json({ ok: false, error: "not_found" });
  n.status = "delivered";
  n.deliveredAt = Date.now();
  res.json({ ok: true, notification: n });
});

/** Delete a notification */
app.delete("/notifications/:id", (req, res) => {
  if (!store.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  store.delete(req.params.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[notifications-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));

