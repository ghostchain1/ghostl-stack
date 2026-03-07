import express from "express";
import crypto from "node:crypto";

const PORT    = Number(process.env.PORT || 7643);
const TTL_MS  = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000); // 8 hours

const app = express();
app.use(express.json());

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
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[session-service] listening on :${PORT}, ttl=${TTL_MS}ms`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
