import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT      = Number(process.env.PORT || 7627);
const DATA_DIR  = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TAGS_FILE = path.join(DATA_DIR, "tags.json");

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
  const t0 = Date.now();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${Date.now() - t0}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


// tags: Map<address, Set<label>>
const tags = new Map();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    for (const [addr, labels] of tags) obj[addr] = [...labels];
    fs.writeFileSync(TAGS_FILE, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  } catch { /* best-effort */ }
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(TAGS_FILE, "utf-8"));
    for (const [addr, labels] of Object.entries(raw)) {
      tags.set(addr, new Set(Array.isArray(labels) ? labels : []));
    }
  } catch { /* file absent is fine */ }
}

load();

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "entity-tagging-service", addresses: tags.size })
);

/** GET /tags — list all tags; filter by ?address= */
app.get("/tags", (req, res) => {
  if (req.query.address) {
    const addr   = String(req.query.address).toLowerCase();
    const labels = [...(tags.get(addr) || [])];
    return res.json({ ok: true, address: addr, labels });
  }
  const result = [];
  for (const [addr, labels] of tags) result.push({ address: addr, labels: [...labels] });
  res.json({ ok: true, total: result.length, tags: result });
});

/** GET /tags/stats — aggregate statistics */
app.get("/tags/stats", (_req, res) => {
  const labelCount = {};
  let totalLabels = 0;
  for (const labels of tags.values()) {
    for (const l of labels) {
      labelCount[l] = (labelCount[l] || 0) + 1;
      totalLabels++;
    }
  }
  const sorted = Object.entries(labelCount).sort((a, b) => b[1] - a[1]);
  res.json({
    ok: true,
    addresses: tags.size,
    totalLabels,
    uniqueLabels: sorted.length,
    topLabels: sorted.slice(0, 10).map(([label, count]) => ({ label, count })),
  });
});

/** GET /tags/search?label=X — find all addresses carrying a specific label */
app.get("/tags/search", (req, res) => {
  const { label } = req.query;
  if (!label) return res.status(400).json({ ok: false, error: "label query param required" });
  const matches = [];
  for (const [addr, labels] of tags) {
    if (labels.has(String(label))) matches.push(addr);
  }
  res.json({ ok: true, label, count: matches.length, addresses: matches });
});

/** POST /tags/batch — bulk add { entries: [{ address, labels: [] }] } */
app.post("/tags/batch", (req, res) => {
  const { entries } = req.body || {};
  if (!Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ ok: false, error: "entries array required" });
  let added = 0;
  for (const { address, labels: lbls } of entries) {
    if (!address || !Array.isArray(lbls)) continue;
    const addr = String(address).toLowerCase();
    if (!tags.has(addr)) tags.set(addr, new Set());
    for (const l of lbls) { tags.get(addr).add(String(l)); added++; }
  }
  persist();
  res.status(201).json({ ok: true, added, totalAddresses: tags.size });
});

/** GET /tags/:address — canonical single-address tag lookup */
app.get("/tags/:address", (req, res) => {
  const addr   = req.params.address.toLowerCase();
  const labels = [...(tags.get(addr) || [])];
  res.json({ ok: true, address: addr, labels });
});

/** POST /tags — add a tag { address, label } */
app.post("/tags", (req, res) => {
  const { address, label } = req.body || {};
  if (!address || !label) return res.status(400).json({ ok: false, error: "address and label required" });
  const addr = String(address).toLowerCase();
  if (!tags.has(addr)) tags.set(addr, new Set());
  tags.get(addr).add(String(label));
  persist();
  res.status(201).json({ ok: true, address: addr, labels: [...tags.get(addr)] });

/** PUT /tags/:address — replace all labels for an address */
app.put("/tags/:address", (req, res) => {
  const addr   = req.params.address.toLowerCase();
  const { labels } = req.body || {};
  if (!Array.isArray(labels)) return res.status(400).json({ ok: false, error: "labels array required" });
  tags.set(addr, new Set(labels.map(String)));
  persist();
  res.json({ ok: true, address: addr, labels: [...tags.get(addr)] });
});

/** DELETE /tags/:address/:label — remove a specific label */
app.delete("/tags/:address/:label", (req, res) => {
  const addr  = req.params.address.toLowerCase();
  const label = req.params.label;
  const set   = tags.get(addr);
  if (!set || !set.has(label)) return res.status(404).json({ ok: false, error: "not_found" });
  set.delete(label);
  if (set.size === 0) tags.delete(addr);
  persist();
  res.json({ ok: true });
});

/** DELETE /tags/:address — remove all tags for an address */
app.delete("/tags/:address", (req, res) => {
  const addr = req.params.address.toLowerCase();
  if (!tags.has(addr)) return res.status(404).json({ ok: false, error: "not_found" });
  tags.delete(addr);
  persist();
  res.json({ ok: true });
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
  console.log(`[entity-tagging-service] listening on :${PORT}, data=${DATA_DIR}`);
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
