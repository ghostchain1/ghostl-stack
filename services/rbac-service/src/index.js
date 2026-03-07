import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT     = Number(process.env.PORT || 7640);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE  = path.join(DATA_DIR, "rbac.json");

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
  res.setHeader("Vary", "Accept");
  res.setHeader("Keep-Alive", "timeout=65");
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
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.headers["access-control-request-private-network"] === "true") { res.setHeader("Access-Control-Allow-Private-Network", "true"); }
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
app.use((req, res, next) => {
  if (["POST","PUT","PATCH"].includes(req.method) && req.headers["content-type"] &&
      !req.is(["application/json","application/x-www-form-urlencoded"])) {
    return res.status(415).json({ ok: false, error: "Unsupported Media Type" });
  }
  next();
});
app.use((req, res, next) => {
  if (req.method !== "OPTIONS" && !req.accepts("application/json")) {
    return res.status(406).json({ ok: false, error: "Not Acceptable" });
  }
  next();
});
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const _tp = req.headers["traceparent"] ?? `00-${crypto.randomUUID().replace(/-/g,"")}-${req.id.replace(/-/g,"").slice(0,16)}-01`;
  res.setHeader("X-Trace-ID", _tp);
  const t0 = process.hrtime.bigint();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2)}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


// Built-in roles (immutable schema); user assignments are mutable
const ROLE_DEFS = {
  admin:     { name: "Admin",     permissions: ["*"] },
  ops:       { name: "Ops",       permissions: ["read", "write:ops", "restart", "logs", "policy"] },
  validator: { name: "Validator", permissions: ["read", "vote"] },
  viewer:    { name: "Viewer",    permissions: ["read"] },
};

// user assignments: Map<userId, Set<roleId>>
const assignments = new Map();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    for (const [uid, roles] of assignments) obj[uid] = [...roles];
    fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  } catch { /* best-effort */ }
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    for (const [uid, roles] of Object.entries(raw)) {
      assignments.set(uid, new Set(Array.isArray(roles) ? roles : []));
    }
  } catch { /* absent is fine */ }
}

load();

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "rbac-service", users: assignments.size })
);

app.get("/roles", (_req, res) => {
  const roles = Object.entries(ROLE_DEFS).map(([id, def]) => ({ id, ...def }));
  res.json({ ok: true, roles });
});

app.get("/roles/:id/permissions", (req, res) => {
  const def = ROLE_DEFS[req.params.id];
  if (!def) return res.status(404).json({ ok: false, error: "role_not_found" });
  res.json({ ok: true, role: req.params.id, permissions: def.permissions });
});

/** GET /users/:userId/roles */
app.get("/users/:userId/roles", (req, res) => {
  const roles = [...(assignments.get(req.params.userId) || [])];
  res.json({ ok: true, userId: req.params.userId, roles });
});

/** POST /users/:userId/roles — assign roles { roles: string[] } */
app.post("/users/:userId/roles", (req, res) => {
  const uid   = req.params.userId;
  const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
  const invalid = roles.filter((r) => !ROLE_DEFS[r]);
  if (invalid.length) return res.status(400).json({ ok: false, error: `unknown roles: ${invalid.join(", ")}` });
  if (!assignments.has(uid)) assignments.set(uid, new Set());
  roles.forEach((r) => assignments.get(uid).add(r));
  persist();
  res.json({ ok: true, userId: uid, roles: [...assignments.get(uid)] });
});

/** DELETE /users/:userId/roles/:roleId */
app.delete("/users/:userId/roles/:roleId", (req, res) => {
  const { userId, roleId } = req.params;
  const set = assignments.get(userId);
  if (!set || !set.has(roleId)) return res.status(404).json({ ok: false, error: "assignment_not_found" });
  set.delete(roleId);
  if (set.size === 0) assignments.delete(userId);
  persist();
  res.json({ ok: true });
});

/** POST /check — { userId, permission } → { allowed: true/false } */
app.post("/check", (req, res) => {
  const { userId, permission } = req.body || {};
  if (!userId || !permission) return res.status(400).json({ ok: false, error: "userId and permission required" });
  const userRoles = [...(assignments.get(userId) || [])];
  const allowed = userRoles.some((r) => {
    const perms = ROLE_DEFS[r]?.permissions || [];
    return perms.includes("*") || perms.includes(permission);
  });
  res.json({ ok: true, userId, permission, allowed });
});

/** GET /users — list all users with their assigned roles */
app.get("/users", (_req, res) => {
  const users = [];
  for (const [userId, roleSet] of assignments) {
    users.push({ userId, roles: [...roleSet] });
  }
  res.json({ ok: true, total: users.length, users });
});

/** DELETE /users/:userId — remove all role assignments for a user */
app.delete("/users/:userId", (req, res) => {
  const { userId } = req.params;
  if (!assignments.has(userId)) return res.status(404).json({ ok: false, error: "user_not_found" });
  assignments.delete(userId);
  persist();
  res.json({ ok: true, userId });
});

/** GET /rbac/stats — summary of users, roles, and assignment coverage */
app.get("/rbac/stats", (_req, res) => {
  const roleCount = Object.keys(ROLE_DEFS).length;
  const userCount = assignments.size;
  const assignmentCount = [...assignments.values()].reduce((sum, s) => sum + s.size, 0);
  const roleUsage = {};
  for (const roleSet of assignments.values()) {
    for (const r of roleSet) roleUsage[r] = (roleUsage[r] || 0) + 1;
  }
  res.json({ ok: true, stats: { userCount, roleCount, assignmentCount, roleUsage, fetchedAt: new Date().toISOString() } });
});


app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  if (err.status === 405 || err.statusCode === 405) return res.status(405).json({ ok: false, error: "Method not allowed" });
  const status = err.status ?? err.statusCode ?? 500;
  const _isProd = process.env.NODE_ENV === "production";
  res.setHeader("Cache-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[rbac-service] listening on :${PORT}, data=${DATA_DIR}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.on("connection", (socket) => socket.setNoDelay(true));
server.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "serverError", error: err?.message ?? String(err), code: err?.code }));
  if (err.code === "EADDRINUSE" || err.code === "EACCES") { process.exitCode = 1; process.exit(1); }
});
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err), stack: err?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason), stack: reason?.stack }));
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
