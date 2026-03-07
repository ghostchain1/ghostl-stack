import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 7641);
const LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(process.cwd(), "data", "audit.log");
const MAX_LINES = 5000;

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
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
app.use(express.json({ limit: "1mb" }));
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


app.get("/health", (_req, res) => res.json({ ok: true, service: "audit-log-service" }));

const readLines = () => {
  if (!fs.existsSync(LOG_PATH)) return [];
  try {
    return fs.readFileSync(LOG_PATH, "utf-8").trim().split("\n").filter(Boolean);
  } catch { return []; }
};

const parseLines = (lines) =>
  lines.map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });

/** GET /logs — paginated + filtered log entries */
app.get("/logs", (req, res) => {
  const lines = readLines();
  let entries = parseLines(lines);

  // Filters
  if (req.query.action) entries = entries.filter((e) => e.action === req.query.action);
  if (req.query.actor) entries = entries.filter((e) => e.actor === req.query.actor || e.userId === req.query.actor);
  if (req.query.level) entries = entries.filter((e) => e.level === req.query.level);
  if (req.query.since) {
    const since = new Date(req.query.since).getTime();
    entries = entries.filter((e) => new Date(e.ts).getTime() >= since);
  }

  // Newest-first after filtering
  entries = entries.reverse();
  const total = entries.length;
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const offset = Number(req.query.offset) || 0;

  res.json({ ok: true, total, entries: entries.slice(offset, offset + limit) });
});

/** POST /logs — append an entry */
app.post("/logs", (req, res) => {
  const entry = req.body || {};
  if (!entry.action) return res.status(400).json({ ok: false, error: "action required" });
  const line = JSON.stringify({ ts: new Date().toISOString(), level: "info", ...entry });
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    // Trim file if over MAX_LINES to prevent unbounded growth
    const existing = readLines();
    if (existing.length >= MAX_LINES) {
      const trimmed = existing.slice(existing.length - (MAX_LINES - 1));
      fs.writeFileSync(LOG_PATH, trimmed.join("\n") + "\n", "utf-8");
    }
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf-8");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

/** GET /logs/stats — entry count + action breakdown */
app.get("/logs/stats", (req, res) => {
  const entries = parseLines(readLines());
  const byAction = {};
  for (const e of entries) {
    const key = e.action || "unknown";
    byAction[key] = (byAction[key] || 0) + 1;
  }
  res.json({ ok: true, total: entries.length, byAction });
});

/** GET /logs/:id — find a single log entry by its id field */
app.get("/logs/:id", (req, res) => {
  const { id } = req.params;
  const entries = parseLines(readLines());
  const entry = entries.find((e) => e.id === id || e.requestId === id);
  if (!entry) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, entry });
});

/** DELETE /logs — purge all entries (or those matching ?action=) */
app.delete("/logs", (req, res) => {
  try {
    if (req.query.action) {
      const lines = readLines();
      const kept = lines.filter((l) => {
        try { return JSON.parse(l).action !== req.query.action; } catch { return true; }
      });
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      fs.writeFileSync(LOG_PATH, kept.join("\n") + (kept.length ? "\n" : ""), "utf-8");
      res.json({ ok: true, purged: true, action: req.query.action, remaining: kept.length });
    } else {
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      fs.writeFileSync(LOG_PATH, "", "utf-8");
      res.json({ ok: true, purged: true });
    }
  } catch (err) { res.status(500).json({ ok: false, error: err?.message }); }
});


app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[audit-log-service] listening on :${PORT}, log=${LOG_PATH}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
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
