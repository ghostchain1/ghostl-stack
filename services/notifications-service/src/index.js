import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7638);

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.set("case sensitive routing", true);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  next();
});
const _CORS_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && _CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const _RL_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const _RL_MAX    = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const _rlStore   = new Map();
setInterval(() => _rlStore.clear(), _RL_WINDOW).unref();
app.use((req, res, next) => {
  const key = req.ip ?? "unknown";
  const count = (_rlStore.get(key) ?? 0) + 1;
  _rlStore.set(key, count);
  res.setHeader("X-RateLimit-Limit", _RL_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, _RL_MAX - count));
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + _RL_WINDOW) / 1000));
  if (count > _RL_MAX) { res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); res.setHeader("RateLimit-Policy", `limit=${_RL_MAX};w=${Math.ceil(_RL_WINDOW / 1000)}`); return res.status(429).json({ error: "Too many requests" }); }
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${Date.now() - t0}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


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
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[notifications-service] listening on :${PORT}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.on("connection", (socket) => socket.setNoDelay(true));
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exitCode = 1; process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGQUIT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});

