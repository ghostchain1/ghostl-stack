/**
 * @file devops-service/src/index.js
 * @description GhostChain DevOps lifecycle service.
 *
 * Tracks software releases, protocol forks, and upgrade plans for GhostChain
 * nodes. Provides node-level restart/upgrade control plane hooks.
 *
 * Env vars:
 *   PORT              (default 7623)
 *   NODE_REGISTRY_URL Optional: URL to a node inventory service for live nodes
 *   CHAIN_TAG         Optional: moniker for this deployment (e.g. "devnet")
 */

import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7623);
const NODE_REGISTRY_URL = process.env.NODE_REGISTRY_URL || "";
const CHAIN_TAG = process.env.CHAIN_TAG || "ghostchain";

const app = express();
process.title = process.env.npm_package_name ?? 'ghoststack';
const _startedAt = process.hrtime.bigint();
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
  res.setHeader("X-Robots-Tag", "noindex,nofollow");
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Timing-Allow-Origin", process.env.TIMING_ALLOW_ORIGIN ?? "");
  if (process.env.REPORT_TO_URL) {
    res.setHeader("Report-To", JSON.stringify({ group: "default", max_age: 86400, endpoints: [{ url: process.env.REPORT_TO_URL }] }));
    res.setHeader("NEL", JSON.stringify({ report_to: "default", max_age: 86400, include_subdomains: false }));
  }
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
const _safeReviver = (k, v) => { if (k === "__proto__" || k === "constructor" || k === "prototype") return undefined; return v; };
app.use(express.json({ limit: "1mb", reviver: _safeReviver }));
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
const _ALLOWED_HOSTS = new Set((process.env.ALLOWED_HOSTS ?? "").split(",").map(s => s.trim()).filter(Boolean));
app.use((req, res, next) => {
  if (_ALLOWED_HOSTS.size > 0) {
    const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
    if (!_ALLOWED_HOSTS.has(host)) { return res.status(421).json({ ok: false, error: "Misdirected Request" }); }
  }
  next();
});
let _activeReqs = 0;
const _MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_REQUESTS ?? 500);
app.use((req, res, next) => {
  if (_activeReqs >= _MAX_CONCURRENT) { res.setHeader("Retry-After", "1"); return res.status(503).json({ ok: false, error: "server_busy" }); }
  _activeReqs++;
  let _decr = false;
  const _decrActive = () => { if (!_decr) { _decr = true; _activeReqs = Math.max(0, _activeReqs - 1); } };
  res.on("finish", _decrActive);
  res.on("close", _decrActive);
  next();
});
const _idemStore = new Map();
setInterval(() => _idemStore.clear(), 5 * 60_000).unref();
app.use((req, res, next) => {
  const _idemKey = req.headers["idempotency-key"];
  if (_idemKey && req.method === "POST") {
    const _cached = _idemStore.get(_idemKey);
    if (_cached) { res.setHeader("Idempotency-Key", _idemKey); return res.status(_cached.status).json(_cached.body); }
    const _origJson = res.json.bind(res);
    res.json = (body) => { if (res.statusCode < 500) { _idemStore.set(_idemKey, { status: res.statusCode, body }); } return _origJson(body); };
  }
  next();
});
let _reqTotal = 0;
let _ellMs = 0;
(function _pollEll() { const _t = process.hrtime.bigint(); setImmediate(() => { _ellMs = Number(process.hrtime.bigint() - _t) / 1e6; setImmediate(_pollEll); }); })();
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  _reqTotal++;
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const _tp = req.headers["traceparent"] ?? `00-${crypto.randomUUID().replace(/-/g,"")}-${req.id.replace(/-/g,"").slice(0,16)}-01`;
  res.setHeader("X-Trace-ID", _tp);
  const _spanId = crypto.randomUUID().replace(/-/g,"").slice(0,16);
  res.setHeader("X-Span-ID", _spanId);
  const _sfs = req.headers["sec-fetch-site"];
  if (_sfs && _sfs !== "same-origin" && _sfs !== "same-site" && _sfs !== "none" && !["GET","HEAD","OPTIONS"].includes(req.method)) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "sec_fetch_cross_site", method: req.method, url: req.url, sfs: _sfs, sfm: req.headers["sec-fetch-mode"] ?? "", sfd: req.headers["sec-fetch-dest"] ?? "", reqId: req.id }));
  }
  const t0 = process.hrtime.bigint();
  res.on("prefinish", () => { try { const _ms = (Number(process.hrtime.bigint()-t0)/1e6).toFixed(2); if (!res.headersSent) { res.setHeader("X-Response-Time", `${_ms}ms`); res.setHeader("Server-Timing", `total;dur=${_ms}`); } } catch {} });
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss, httpVer: req.httpVersion, xff: req.headers["x-forwarded-for"] ?? "" })));
  next();
});


// ─── In-memory store (bootstrapped from env / future: persisted to disk) ─────

/**
 * @typedef {{ id:string, tag:string, notes:string, publishedAt:string, components:string[] }} Release
 * @typedef {{ id:string, name:string, activationEpoch:number|null, status:string, description:string }} Fork
 * @typedef {{ id:string, nodeId:string, fromVersion:string, toVersion:string, status:string, scheduledAt:string|null, completedAt:string|null }} Upgrade
 */

/** @type {Release[]} */
const releases = [
  {
    id: "rel-genesis",
    tag: "v1.0.0",
    notes: "Genesis release — GhostChain L1/L2/L3 stack",
    publishedAt: "2026-01-15T00:00:00.000Z",
    components: ["ghostd", "ghostx-api", "bridge-service", "ghostbrain-core"]
  }
];

/** @type {Fork[]} */
const forks = [
  {
    id: "fork-genesis",
    name: "genesis",
    activationEpoch: 0,
    status: "active",
    description: "Initial protocol fork — GhostChain v1 consensus rules"
  }
];

/** @type {Upgrade[]} */
const upgrades = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const randomId = (prefix = "id") => `${prefix}-${crypto.randomBytes(6).toString("hex")}`;

/** Fetch live nodes from inventory service (if configured). */
async function fetchNodes() {
  if (!NODE_REGISTRY_URL) return [];
  try {
    const res = await fetch(`${NODE_REGISTRY_URL}/nodes`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body.nodes) ? body.nodes : [];
  } catch {
    return [];
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "devops-service",
    chain: CHAIN_TAG,
    releases: releases.length,
    forks: forks.length,
    upgrades: upgrades.length,
  });
});

// ── Releases ─────────────────────────────────────────────────────────────────

app.get("/releases", (_req, res) => {
  // Newest first
  const sorted = [...releases].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  res.json({ ok: true, releases: sorted });
});

app.post("/releases", (req, res) => {
  const { tag, notes, components } = req.body || {};
  if (!tag) {
    res.status(400).json({ ok: false, error: "tag required" });
    return;
  }
  const release = {
    id: randomId("rel"),
    tag: String(tag),
    notes: String(notes || ""),
    publishedAt: new Date().toISOString(),
    components: Array.isArray(components) ? components.map(String) : [],
  };
  releases.push(release);
  res.status(201).json({ ok: true, release });
});

app.get("/releases/:id", (req, res) => {
  const release = releases.find((r) => r.id === req.params.id);
  if (!release) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  res.json({ ok: true, release });
});

// ── Forks ─────────────────────────────────────────────────────────────────────

app.get("/forks", (_req, res) => {
  res.json({ ok: true, forks });
});

app.post("/forks", (req, res) => {
  const { name, activationEpoch, description } = req.body || {};
  if (!name) {
    res.status(400).json({ ok: false, error: "name required" });
    return;
  }
  const fork = {
    id: randomId("fork"),
    name: String(name),
    activationEpoch: activationEpoch != null ? Number(activationEpoch) : null,
    status: "pending",
    description: String(description || ""),
  };
  forks.push(fork);
  res.status(201).json({ ok: true, fork });
});

// ── Upgrades ──────────────────────────────────────────────────────────────────

app.get("/upgrades", (_req, res) => {
  res.json({ ok: true, upgrades });
});

app.post("/upgrades", (req, res) => {
  const { nodeId, fromVersion, toVersion, scheduledAt } = req.body || {};
  if (!nodeId || !toVersion) {
    res.status(400).json({ ok: false, error: "nodeId and toVersion required" });
    return;
  }
  const upgrade = {
    id: randomId("upg"),
    nodeId: String(nodeId),
    fromVersion: String(fromVersion || "unknown"),
    toVersion: String(toVersion),
    status: "scheduled",
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    completedAt: null,
  };
  upgrades.push(upgrade);
  res.status(201).json({ ok: true, upgrade });
});

// ── Node control ──────────────────────────────────────────────────────────────

app.get("/nodes", async (_req, res) => {
  const nodes = await fetchNodes();
  res.json({ ok: true, nodes });
});

app.post("/nodes/:id/restart", async (req, res) => {
  const { id } = req.params;
  // If NODE_REGISTRY_URL provided, forward restart signal
  if (NODE_REGISTRY_URL) {
    try {
      const upstream = await fetch(`${NODE_REGISTRY_URL}/nodes/${encodeURIComponent(id)}/restart`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(5000),
      });
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
      return;
    } catch (e) {
      res.status(502).json({ ok: false, error: /** @type {Error} */ (e).message });
      return;
    }
  }
  // No upstream inventory — acknowledge the request and record an upgrade event
  console.log(`[devops-service] restart requested for node ${id}`);
  res.json({ ok: true, nodeId: id, action: "restart", status: "acknowledged", ts: new Date().toISOString() });
});

app.post("/nodes/:id/upgrade", async (req, res) => {
  const { id } = req.params;
  if (NODE_REGISTRY_URL) {
    try {
      const upstream = await fetch(`${NODE_REGISTRY_URL}/nodes/${encodeURIComponent(id)}/upgrade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(5000),
      });
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
      return;
    } catch (e) {
      res.status(502).json({ ok: false, error: /** @type {Error} */ (e).message });
      return;
    }
  }
  const { toVersion } = req.body || {};
  const upgrade = {
    id: randomId("upg"),
    nodeId: id,
    fromVersion: "unknown",
    toVersion: String(toVersion || "latest"),
    status: "initiated",
    scheduledAt: new Date().toISOString(),
    completedAt: null,
  };
  upgrades.push(upgrade);
  console.log(`[devops-service] upgrade initiated for node ${id} → ${upgrade.toVersion}`);
  res.json({ ok: true, nodeId: id, action: "upgrade", upgrade });
});

/** GET /stats — aggregate counts across releases, forks and upgrades */
app.get("/stats", (_req, res) => {
  const upgradesByStatus = {};
  for (const u of upgrades) upgradesByStatus[u.status] = (upgradesByStatus[u.status] || 0) + 1;
  res.json({ ok: true, stats: { releases: releases.length, forks: forks.length, upgrades: upgrades.length, upgradesByStatus, chainTag: CHAIN_TAG, fetchedAt: new Date().toISOString() } });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.get("/readyz", (_req, res) => {
  if (_draining) { res.setHeader("Retry-After", "5"); return res.status(503).json({ ok: false, error: "draining" }); }
  res.json({ ok: true });
});
app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("Surrogate-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  if (err.status === 405 || err.statusCode === 405) return res.status(405).json({ ok: false, error: "Method not allowed" });
  const status = err.status ?? err.statusCode ?? 500;
  const _isProd = process.env.NODE_ENV === "production";
  if (res.headersSent) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[devops-service] Listening on port ${PORT} chain=${CHAIN_TAG}`);
  if (NODE_REGISTRY_URL) console.log(`[devops-service] Node registry: ${NODE_REGISTRY_URL}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.maxConnections = 1024;
server.maxRequestsPerSocket = 100;
server.on("connection", (socket) => socket.setNoDelay(true));
server.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "serverError", error: err?.message ?? String(err), code: err?.code }));
  if (err.code === "EADDRINUSE" || err.code === "EACCES") { process.exitCode = 1; process.exit(1); }
});
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown", port: PORT, pid: process.pid, boot_ms: Number((process.hrtime.bigint() - _startedAt) / 1_000_000n), env: process.env.NODE_ENV ?? "development" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGUSR2", () => {
  const m = process.memoryUsage(); const cu = process.cpuUsage();
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sigusr2_diag", pid: process.pid, rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, cpuUser: cu.user, cpuSystem: cu.system, reqTotal: _reqTotal, uptime: process.uptime(), ell: _ellMs, handles: process._getActiveHandles().length }));
});
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
process.on("SIGHUP", () => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sighup_reload", pid: process.pid })); });
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err), stack: err?.stack, cause: err?.cause != null ? String(err.cause) : undefined }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason), stack: reason?.stack, cause: reason?.cause != null ? String(reason.cause) : undefined }));
  process.exitCode = 1; process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "shutdown_timeout", pid: process.pid })); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "shutdown_complete", pid: process.pid })); process.exit(0); });
});
process.on("SIGINT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "shutdown_complete", pid: process.pid })); process.exit(0); });
});
process.on("SIGQUIT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "shutdown_complete", pid: process.pid })); process.exit(0); });
});
