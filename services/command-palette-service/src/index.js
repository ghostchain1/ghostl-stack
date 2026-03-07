import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7642);

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


// Built-in commands (immutable seed)
const BUILTIN = [
  { id: "restart-l2",       label: "Restart L2",        category: "Ops",        builtin: true },
  { id: "restart-l3",       label: "Restart L3",        category: "Ops",        builtin: true },
  { id: "open-validators",  label: "Open Validators",   category: "Navigation", builtin: true },
  { id: "view-logs",        label: "View Logs",         category: "Navigation", builtin: true },
  { id: "run-snapshot",     label: "Run Snapshot",      category: "Ops",        builtin: true },
  { id: "clear-cache",      label: "Clear Cache",       category: "Ops",        builtin: true },
  { id: "open-governance",  label: "Open Governance",   category: "Navigation", builtin: true },
];

// runtime-registered commands
const custom = new Map(); // id → command

function allCommands() {
  return [...BUILTIN, ...custom.values()];
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "command-palette-service", total: allCommands().length })
);

/** GET /commands?category=&q= — list all commands with optional filter */
app.get("/commands", (req, res) => {
  let cmds = allCommands();
  if (req.query.category) {
    cmds = cmds.filter((c) => c.category?.toLowerCase() === String(req.query.category).toLowerCase());
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    cmds = cmds.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }
  res.json({ ok: true, total: cmds.length, commands: cmds });
});

/** GET /commands/stats — counts by category and builtin vs custom */
app.get("/commands/stats", (_req, res) => {
  const all = allCommands();
  const byCategory = {};
  for (const c of all) {
    const cat = c.category || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, builtin: BUILTIN.length, custom: custom.size, byCategory } });
});


/** GET /commands/:id */
app.get("/commands/:id", (req, res) => {
  const cmd = allCommands().find((c) => c.id === req.params.id);
  if (!cmd) return res.status(404).json({ ok: false, error: "command_not_found" });
  res.json({ ok: true, command: cmd });
});

/** POST /commands — register a custom command */
app.post("/commands", (req, res) => {
  const { label, category, action } = req.body || {};
  if (!label) return res.status(400).json({ ok: false, error: "label required" });
  const id = req.body.id || `custom-${crypto.randomUUID().slice(0, 8)}`;
  if (BUILTIN.some((c) => c.id === id)) {
    return res.status(409).json({ ok: false, error: "id conflicts with builtin command" });
  }
  const cmd = { id, label, category: category || "Custom", action: action || null, builtin: false };
  custom.set(id, cmd);
  res.status(201).json({ ok: true, command: cmd });
});

/** DELETE /commands/:id — remove a custom command (builtins are protected) */
app.delete("/commands/:id", (req, res) => {
  if (BUILTIN.some((c) => c.id === req.params.id)) {
    return res.status(403).json({ ok: false, error: "cannot delete builtin command" });
  }
  if (!custom.has(req.params.id)) return res.status(404).json({ ok: false, error: "command_not_found" });
  custom.delete(req.params.id);
  res.json({ ok: true });
});

/** POST /commands/:id/execute — record execution (no-op for builtins; returns action for custom) */
app.post("/commands/:id/execute", (req, res) => {
  const cmd = allCommands().find((c) => c.id === req.params.id);
  if (!cmd) return res.status(404).json({ ok: false, error: "command_not_found" });
  res.json({ ok: true, command: cmd, executedAt: new Date().toISOString(), context: req.body || {} });
});

app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[command-palette-service] listening on :${PORT}`);
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
