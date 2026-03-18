/**
 * ghost-health-aggregator
 *
 * Central health dashboard for all GhostChain application services.
 *
 * Polls /health, /healthz, or /status on each registered service and
 * returns a unified status object — instantly usable by dashboards,
 * alerting, and CI smoke tests.
 *
 * Endpoints:
 *   GET /health          — liveness (this service itself)
 *   GET /status          — full aggregated report (all services)
 *   GET /status/:service — single-service report
 *   GET /summary         — compact ok/degraded/down counts
 *
 * Port: 7640  (override with PORT env var)
 */

import express from "express";

const PORT       = Number(process.env.PORT     ?? 7640);
const TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 3000);
const CACHE_MS   = Number(process.env.POLL_CACHE_MS   ?? 10_000);

// ── Service registry ──────────────────────────────────────────────────────────
// Each entry: { id: string, url: string, probe: "/health"|"/healthz"|"/status" }
// URL comes from env vars (docker-compose service names) with sensible defaults.

const SERVICES = Object.freeze([
  // ── Core brain & AI ──────────────────────────────────────────────────────
  { id: "ghostbrain-core",          url: process.env.GHOSTBRAIN_CORE_URL         ?? "http://ghostbrain-core:7900",          probe: "/readyz"  },
  { id: "hyper-ghost-ai",           url: process.env.HYPER_GHOST_BASE_URL        ?? "http://hyper-ghost-ai:7741",           probe: "/health"  },
  { id: "ghostbrain-gsa",           url: process.env.GSA_BASE_URL                ?? "http://ghostbrain-gsa:7850",           probe: "/health"  },
  { id: "hyper-ghost-governor",     url: process.env.HG_GOVERNOR_URL             ?? "http://hyper-ghost-governor:7742",     probe: "/health"  },
  { id: "hyper-ghost-supervisor",   url: process.env.HG_SUPERVISOR_URL           ?? "http://hyper-ghost-supervisor:7743",   probe: "/health"  },
  { id: "ghost-guard",              url: process.env.GHOST_GUARD_URL             ?? "http://ghost-guard:7701",             probe: "/health"  },
  { id: "ghostcontract-ai",         url: process.env.GHOSTCONTRACT_AI_URL        ?? "http://ghostcontract-ai:7650",        probe: "/health"  },
  { id: "ghost-ai-consensus",       url: process.env.GHOST_AI_CONSENSUS_URL      ?? "http://ghost-ai-consensus:7660",      probe: "/health"  },
  { id: "ghost-ai-attestor",        url: process.env.GHOST_AI_ATTESTOR_URL       ?? "http://ghost-ai-attestor:7661",       probe: "/health"  },
  { id: "ghost-storage-ai",         url: process.env.GHOST_STORAGE_AI_URL        ?? "http://ghost-storage-ai:7670",        probe: "/health"  },

  // ── Governance ───────────────────────────────────────────────────────────
  { id: "governance-service",       url: process.env.GOVERNANCE_SERVICE_URL      ?? "http://governance-service:7645",      probe: "/health"  },
  { id: "governance-event-bridge",  url: process.env.GOV_BRIDGE_URL              ?? "http://governance-event-bridge:7646", probe: "/health"  },
  { id: "ghost-registry",           url: process.env.GHOST_REGISTRY_URL          ?? "http://ghost-registry:7680",          probe: "/health"  },

  // ── Treasury & economics ──────────────────────────────────────────────────
  { id: "treasury-ai",              url: process.env.TREASURY_AI_URL             ?? "http://treasury-ai:7630",             probe: "/health"  },
  { id: "treasury-service",         url: process.env.TREASURY_SERVICE_URL        ?? "http://treasury-service:7631",        probe: "/health"  },
  { id: "treasury-engine",          url: process.env.TREASURY_ENGINE_URL         ?? "http://treasury-engine:7632",         probe: "/health"  },
  { id: "hg-treasury-agent",        url: process.env.HG_TREASURY_AGENT_URL       ?? "http://hg-treasury-agent:7633",       probe: "/health"  },
  { id: "hg-risk-oracle",           url: process.env.HG_RISK_ORACLE_URL          ?? "http://hg-risk-oracle:7635",          probe: "/health"  },
  { id: "fee-model-service",        url: process.env.FEE_MODEL_URL               ?? "http://fee-model-service:7510",       probe: "/health"  },
  { id: "ghost-gas-engine",         url: process.env.GAS_ENGINE_URL              ?? "http://ghost-gas-engine:7500",        probe: "/health"  },

  // ── Chain & node ops ─────────────────────────────────────────────────────
  { id: "chain-status-service",     url: process.env.CHAIN_STATUS_URL            ?? "http://chain-status-service:7600",    probe: "/health"  },
  { id: "node-health-service",      url: process.env.NODE_HEALTH_URL             ?? "http://node-health-service:7613",     probe: "/health"  },
  { id: "block-index-service",      url: process.env.BLOCK_INDEX_URL             ?? "http://block-index-service:7602",     probe: "/health"  },
  { id: "ghost-rpc-proxy",          url: process.env.GHOST_RPC_PROXY_URL         ?? "http://ghost-rpc-proxy:7614",         probe: "/health"  },
  { id: "ghost-relayer",            url: process.env.GHOST_RELAYER_URL           ?? "http://ghost-relayer:7620",           probe: "/health"  },
  { id: "ghost-rollup-proposer",    url: process.env.ROLLUP_PROPOSER_URL         ?? "http://ghost-rollup-proposer:7450",   probe: "/health"  },
  { id: "ghost-rollup-challenger",  url: process.env.ROLLUP_CHALLENGER_URL       ?? "http://ghost-rollup-challenger:7451", probe: "/health"  },

  // ── Theme & UI ────────────────────────────────────────────────────────────
  { id: "theme-service",            url: process.env.THEME_SERVICE_URL           ?? "http://theme-service:7634",           probe: "/health"  },

  // ── Auth, RBAC, sessions ─────────────────────────────────────────────────
  { id: "auth-service",             url: process.env.AUTH_SERVICE_URL            ?? "http://auth-service:7700",            probe: "/health"  },
  { id: "rbac-service",             url: process.env.RBAC_SERVICE_URL            ?? "http://rbac-service:7705",            probe: "/health"  },
  { id: "session-service",          url: process.env.SESSION_SERVICE_URL         ?? "http://session-service:7706",         probe: "/health"  },
  { id: "ghost-jwks-guard",         url: process.env.GHOST_JWKS_GUARD_URL        ?? "http://ghost-jwks-guard:7707",        probe: "/health"  },
  { id: "key-rotation-service",     url: process.env.KEY_ROTATION_URL            ?? "http://key-rotation-service:7708",    probe: "/health"  },

  // ── Compliance & audit ────────────────────────────────────────────────────
  { id: "ghost-compliance",         url: process.env.COMPLIANCE_URL              ?? "http://ghost-compliance:7710",        probe: "/health"  },
  { id: "audit-log-service",        url: process.env.AUDIT_LOG_URL               ?? "http://audit-log-service:7711",       probe: "/health"  },
  { id: "ghost-secure-logger",      url: process.env.SECURE_LOGGER_URL           ?? "http://ghost-secure-logger:7712",     probe: "/health"  },

  // ── Monitoring & alerts ────────────────────────────────────────────────────
  { id: "alerts-service",           url: process.env.ALERTS_SERVICE_URL          ?? "http://alerts-service:7720",          probe: "/health"  },
  { id: "anomaly-detection-service",url: process.env.ANOMALY_URL                 ?? "http://anomaly-detection-service:7721",probe: "/health" },
  { id: "ai-monitor",               url: process.env.AI_MONITOR_URL              ?? "http://ai-monitor:7722",              probe: "/health"  },
  { id: "notifications-service",    url: process.env.NOTIFICATIONS_URL           ?? "http://notifications-service:7730",   probe: "/health"  },
]);

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {"ok"|"degraded"|"down"|"unknown"} HealthState
 * @typedef {{ id: string, url: string, state: HealthState, latencyMs: number|null, checkedAt: string, detail?: string }} ServiceStatus
 */

// ── Poll cache ────────────────────────────────────────────────────────────────

/** @type {Map<string, import("./types").ServiceStatus>} */
const cache = new Map();
let cacheExpiresAt = 0;

// ── Probe a single service ─────────────────────────────────────────────────────

/**
 * Poll one service's health probe.
 * @param {{ id: string, url: string, probe: string }} svc
 * @returns {Promise<{ id: string, url: string, state: string, latencyMs: number|null, checkedAt: string, detail?: string }>}
 */
async function pollService(svc) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${svc.url}${svc.probe}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const latencyMs = Date.now() - start;
    const state = res.ok ? "ok" : res.status >= 500 ? "down" : "degraded";
    return {
      id:        svc.id,
      url:       svc.url,
      state,
      latencyMs,
      checkedAt: new Date().toISOString(),
      ...(res.ok ? {} : { detail: `HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      id:        svc.id,
      url:       svc.url,
      state:     err?.name === "AbortError" ? "degraded" : "down",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      detail:    err?.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : (err?.message ?? "connection refused"),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Aggregate all services ─────────────────────────────────────────────────────

async function pollAll() {
  const results = await Promise.allSettled(SERVICES.map(pollService));
  const fresh = new Map();
  for (const r of results) {
    if (r.status === "fulfilled") {
      fresh.set(r.value.id, r.value);
    }
  }
  return fresh;
}

async function getStatus() {
  const now = Date.now();
  if (cache.size > 0 && now < cacheExpiresAt) return cache;
  const fresh = await pollAll();
  cache.clear();
  for (const [k, v] of fresh) cache.set(k, v);
  cacheExpiresAt = now + CACHE_MS;
  return cache;
}

// ── Express app ───────────────────────────────────────────────────────────────

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
app.use(express.json({ limit: "256kb", reviver: _safeReviver }));
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

/** Liveness — always 200 if this process is alive. */
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ghost-health-aggregator", ts: new Date().toISOString() });
});

/** Summary — fast compact counts */
app.get("/summary", async (_req, res) => {
  try {
    const statuses = await getStatus();
    const counts = { ok: 0, degraded: 0, down: 0, unknown: 0 };
    for (const { state } of statuses.values()) {
      counts[state] = (counts[state] ?? 0) + 1;
    }
    const overall = counts.down > 0 ? "down" : counts.degraded > 0 ? "degraded" : "ok";
    res.json({
      overall,
      total: statuses.size,
      counts,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/** Full report — all services with latency and detail. */
app.get("/status", async (_req, res) => {
  try {
    const statuses = await getStatus();
    const services = [...statuses.values()];
    const counts = { ok: 0, degraded: 0, down: 0 };
    for (const { state } of services) {
      if (state in counts) counts[state]++;
    }
    const overall = counts.down > 0 ? "down" : counts.degraded > 0 ? "degraded" : "ok";
    res.json({
      overall,
      total:     services.length,
      counts,
      services,
      ts:        new Date().toISOString(),
      cacheHit:  cacheExpiresAt > Date.now(),
      cacheExpiresAt: new Date(cacheExpiresAt).toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/** GET /stats — aggregate service health counts */
app.get("/stats", async (_req, res) => {
  try {
    const statuses = await getStatus();
    const counts = { ok: 0, degraded: 0, down: 0, unknown: 0 };
    for (const { state } of statuses.values()) counts[state] = (counts[state] ?? 0) + 1;
    const overall = counts.down > 0 ? "down" : counts.degraded > 0 ? "degraded" : "ok";
    res.json({ ok: true, stats: { overall, total: statuses.size, counts, cacheHit: cacheExpiresAt > Date.now(), fetchedAt: new Date().toISOString() } });
  } catch (err) { res.status(500).json({ ok: false, error: err?.message ?? String(err) }); }
});

/** Single-service report — force-refresh for that service. */
app.get("/status/:service", async (req, res) => {
  const id = req.params.service;
  const svc = SERVICES.find(s => s.id === id);
  if (!svc) {
    return res.status(404).json({ ok: false, error: `Service '${id}' is not registered` });
  }
  try {
    const result = await pollService(svc);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({
    ts:      new Date().toISOString(),
    service: "ghost-health-aggregator",
    port:    PORT,
    services: SERVICES.length,
    msg:     "ghost-health-aggregator ready",
  }));
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

// Graceful shutdown
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
