import express from "express";
import crypto from "node:crypto";

const PORT    = Number(process.env.PORT || 7643);
const TTL_MS  = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000); // 8 hours

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
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
  res.removeHeader("X-Powered-By");
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
  if (count > _RL_MAX) return res.status(429).json({ error: "Too many requests" });
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


// sessions: Map<id, session>
const sessions = new Map();

const randomHex = (bytes = 16) => crypto.randomBytes(bytes).toString("hex");

function isExpired(session) {
  return Date.now() > session.expiresAt;
}

// Periodic cleanup of expired sessions (every 5 min)
setInterval(() => {
  for (const [id, s] of sessions) {
    if (isExpired(s)) sessions.delete(id);
  }
}, 5 * 60 * 1000);

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "session-service", active: [...sessions.values()].filter((s) => !isExpired(s)).length })
);

/** List all active sessions */
app.get("/sessions", (_req, res) => {
  const active = [...sessions.values()].filter((s) => !isExpired(s));
  res.json({ ok: true, total: active.length, sessions: active });
});

/** GET /sessions/stats — total, active, expired counts */
app.get("/sessions/stats", (_req, res) => {
  const all = [...sessions.values()];
  const active = all.filter((s) => !isExpired(s));
  const byUser = {};
  for (const s of active) byUser[s.userId] = (byUser[s.userId] || 0) + 1;
  res.json({ ok: true, stats: { total: all.length, active: active.length, expired: all.length - active.length, uniqueUsers: Object.keys(byUser).length } });
});


/** Get a specific session */
app.get("/sessions/:id", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s || isExpired(s)) return res.status(404).json({ ok: false, error: "session_not_found" });
  res.json({ ok: true, session: s });
});

/** Create a session */
app.post("/sessions", (req, res) => {
  const userId    = req.body?.userId || "anon";
  const roles     = Array.isArray(req.body?.roles) ? req.body.roles : [];
  const meta      = req.body?.meta || {};
  const id        = randomHex(16);
  const now       = Date.now();
  const session   = {
    id,
    userId,
    roles,
    meta,
    ip: req.ip,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + TTL_MS,
    expiresAtIso: new Date(now + TTL_MS).toISOString(),
  };
  sessions.set(id, session);
  res.status(201).json({ ok: true, session });
});

/** Refresh a session (extend TTL) */
app.post("/sessions/:id/refresh", (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s || isExpired(s)) return res.status(404).json({ ok: false, error: "session_not_found" });
  s.expiresAt = Date.now() + TTL_MS;
  s.expiresAtIso = new Date(s.expiresAt).toISOString();
  res.json({ ok: true, session: s });
});

/** Invalidate (delete) a session */
app.delete("/sessions/:id", (req, res) => {
  if (!sessions.has(req.params.id)) return res.status(404).json({ ok: false, error: "session_not_found" });
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

/** Invalidate all sessions for a user */
app.delete("/sessions/user/:userId", (req, res) => {
  const uid = req.params.userId;
  let count = 0;
  for (const [id, s] of sessions) {
    if (s.userId === uid) { sessions.delete(id); count++; }
  }
  res.json({ ok: true, invalidated: count });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[session-service] listening on :${PORT}, ttl=${TTL_MS}ms`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
