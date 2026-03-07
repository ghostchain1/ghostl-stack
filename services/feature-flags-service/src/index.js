import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT     = Number(process.env.PORT || 7611);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE  = path.join(DATA_DIR, "flags.json");

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


// flags: Map<name, { name, enabled, description, updatedAt }>
const flags = new Map();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    for (const [name, f] of flags) obj[name] = f;
    fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  } catch { /* best-effort */ }
}

function load() {
  // Seed from FEATURE_FLAGS env: comma-separated names → all enabled
  const envFlags = (process.env.FEATURE_FLAGS || "").split(",").map((f) => f.trim()).filter(Boolean);
  for (const name of envFlags) {
    flags.set(name, { name, enabled: true, description: "", updatedAt: new Date().toISOString() });
  }
  // Overlay with persisted state (runtime changes survive restarts)
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    for (const [name, f] of Object.entries(raw)) flags.set(name, f);
  } catch { /* absent is fine */ }
}

load();

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "feature-flags-service", total: flags.size })
);

/** GET /flags — list all feature flags */
app.get("/flags", (req, res) => {
  let items = [...flags.values()];
  if (req.query.enabled !== undefined) {
    const want = req.query.enabled !== "false";
    items = items.filter((f) => f.enabled === want);
  }
  res.json({ ok: true, total: items.length, flags: items });
});

/** GET /flags/stats — counts of enabled vs disabled flags */
app.get("/flags/stats", (_req, res) => {
  const all = [...flags.values()];
  const enabled = all.filter((f) => f.enabled).length;
  res.json({ ok: true, stats: { total: all.length, enabled, disabled: all.length - enabled } });
});


/** GET /flags/:name */
app.get("/flags/:name", (req, res) => {
  const f = flags.get(req.params.name);
  if (!f) return res.status(404).json({ ok: false, error: "flag_not_found" });
  res.json({ ok: true, flag: f });
});

/** PUT /flags/:name — create or update a flag { enabled, description } */
app.put("/flags/:name", (req, res) => {
  const name    = req.params.name;
  const enabled = req.body?.enabled !== false; // default true
  const description = req.body?.description ?? flags.get(name)?.description ?? "";
  const f = { name, enabled, description, updatedAt: new Date().toISOString() };
  flags.set(name, f);
  persist();
  res.json({ ok: true, flag: f });
});

/** PATCH /flags/:name/toggle — flip enabled state */
app.patch("/flags/:name/toggle", (req, res) => {
  const f = flags.get(req.params.name);
  if (!f) return res.status(404).json({ ok: false, error: "flag_not_found" });
  f.enabled = !f.enabled;
  f.updatedAt = new Date().toISOString();
  persist();
  res.json({ ok: true, flag: f });
});

/** DELETE /flags/:name */
app.delete("/flags/:name", (req, res) => {
  if (!flags.has(req.params.name)) return res.status(404).json({ ok: false, error: "flag_not_found" });
  flags.delete(req.params.name);
  persist();
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[feature-flags-service] listening on :${PORT}, flags=${flags.size}`);
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
