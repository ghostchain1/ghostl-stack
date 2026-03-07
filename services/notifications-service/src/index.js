import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7638);

const app = express();
app.use(express.json());

// In-memory notification store (survives restart-safe via POST /notifications)
const store = new Map(); // id → notification

function makeId() { return crypto.randomUUID(); }

app.get("/health", (_req, res) => res.json({ ok: true, service: "notifications-service", count: store.size }));

/** List notifications with optional channel / status filter */
app.get("/notifications", (req, res) => {
  let items = [...store.values()].sort((a, b) => b.createdAt - a.createdAt);
  if (req.query.channel) items = items.filter((n) => n.channel === req.query.channel);
  if (req.query.status)  items = items.filter((n) => n.status === req.query.status);
  const limit  = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, total: store.size, notifications: items.slice(offset, offset + limit) });
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

app.listen(PORT, () => {
  console.log(`[notifications-service] listening on :${PORT}`);
});

