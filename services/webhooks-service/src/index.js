/**
 * @file webhooks-service/src/index.js
 * @description GhostChain outbound webhook delivery service.
 *
 * Manages webhook endpoint registrations and outbound delivery of signed
 * event payloads to registered subscriber URLs. Delivery attempts are logged
 * with HMAC-SHA256 signatures for receiver verification.
 *
 * Security: outbound requests are signed with WEBHOOK_SECRET using
 * HMAC-SHA256 over "timestamp.body" — receivers must verify this signature.
 *
 * Env vars:
 *   PORT            (default 7652)
 *   WEBHOOK_SECRET  HMAC signing secret for outbound deliveries
 *   MAX_RETRIES     Max delivery retry attempts per event (default 3)
 *   RETRY_DELAY_MS  Base retry delay in milliseconds (default 1000)
 */

import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7652);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 1000);

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
  res.on("prefinish", () => { const _ms = (Number(process.hrtime.bigint()-t0)/1e6).toFixed(2); res.setHeader("X-Response-Time", `${_ms}ms`); res.setHeader("Server-Timing", `total;dur=${_ms}`); });
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss, httpVer: req.httpVersion, xff: req.headers["x-forwarded-for"] ?? "" })));
  next();
});


// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ id:string, url:string, events:string[], secret:string, active:boolean, createdAt:string }} WebhookEndpoint
 * @typedef {{ id:string, endpointId:string, event:string, status:'success'|'failed'|'pending', attempts:number, lastAttemptAt:string|null, responseStatus:number|null, deliveredAt:string|null }} Delivery
 */

/** @type {WebhookEndpoint[]} */
const endpoints = [];

/** @type {Delivery[]} */
const deliveries = [];

const randomId = (p = "wh") => `${p}-${crypto.randomBytes(6).toString("hex")}`;

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign a delivery payload for receiver verification.
 * Signature format: HMAC-SHA256("timestamp.body", secret)
 * @param {string} body  — JSON-stringified payload
 * @param {string} ts    — Unix ms timestamp string
 * @param {string} secret — per-endpoint or global secret
 * @returns {string} hex digest
 */
function signPayload(body, ts, secret) {
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
}

// ─── Delivery engine ──────────────────────────────────────────────────────────

/**
 * Attempt to deliver an event to an endpoint URL with retries.
 * @param {WebhookEndpoint} endpoint
 * @param {string} event
 * @param {unknown} payload
 */
async function deliver(endpoint, event, payload) {
  const deliveryId = randomId("del");
  /** @type {Delivery} */
  const delivery = {
    id: deliveryId,
    endpointId: endpoint.id,
    event,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    responseStatus: null,
    deliveredAt: null,
  };
  deliveries.push(delivery);

  const body = JSON.stringify({ id: deliveryId, event, data: payload });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    delivery.attempts = attempt;
    delivery.lastAttemptAt = new Date().toISOString();

    const ts = String(Date.now());
    const sig = signPayload(body, ts, endpoint.secret || WEBHOOK_SECRET);

    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ghost-event": event,
          "x-ghost-delivery": deliveryId,
          "x-ghost-timestamp": ts,
          ...(sig ? { "x-ghost-signature": sig } : {}),
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      delivery.responseStatus = res.status;
      if (res.ok) {
        delivery.status = "success";
        delivery.deliveredAt = new Date().toISOString();
        return;
      }
      // Non-2xx — retry
    } catch {
      // Network error — retry
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }

  delivery.status = "failed";
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "webhooks-service",
    endpoints: endpoints.length,
    deliveries: deliveries.length,
    signed: !!WEBHOOK_SECRET,
  });
});

// ── Endpoint management ───────────────────────────────────────────────────────

app.get("/status", (_req, res) => {
  const successCount = deliveries.filter((d) => d.status === "success").length;
  const failedCount = deliveries.filter((d) => d.status === "failed").length;
  const pendingCount = deliveries.filter((d) => d.status === "pending").length;
  res.json({
    ok: true,
    endpoints: endpoints.length,
    deliveries: {
      total: deliveries.length,
      success: successCount,
      failed: failedCount,
      pending: pendingCount,
    },
  });
});

app.get("/endpoints", (_req, res) => {
  // Don't expose per-endpoint secrets
  const safe = endpoints.map(({ id, url, events, active, createdAt }) => ({
    id, url, events, active, createdAt,
  }));
  res.json({ ok: true, endpoints: safe });
});

app.post("/endpoints", (req, res) => {
  const { url, events, secret } = req.body || {};
  if (!url) {
    res.status(400).json({ ok: false, error: "url required" });
    return;
  }
  // Basic URL validation (must be http/https)
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ ok: false, error: "url must be http or https" });
      return;
    }
  } catch {
    res.status(400).json({ ok: false, error: "invalid url" });
    return;
  }

  const endpoint = {
    id: randomId("ep"),
    url: String(url),
    events: Array.isArray(events) ? events.map(String) : ["*"],
    secret: String(secret || ""),
    active: true,
    createdAt: new Date().toISOString(),
  };
  endpoints.push(endpoint);
  res.status(201).json({ ok: true, endpoint: { ...endpoint, secret: undefined } });
});

app.delete("/endpoints/:id", (req, res) => {
  const idx = endpoints.findIndex((e) => e.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  endpoints.splice(idx, 1);
  res.json({ ok: true, deleted: req.params.id });
});

// ── Deliveries ────────────────────────────────────────────────────────────────

app.get("/deliveries", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  const endpointId = req.query.endpointId;
  let result = endpointId
    ? deliveries.filter((d) => d.endpointId === endpointId)
    : deliveries;
  result = [...result].reverse().slice(0, limit);
  res.json({ ok: true, deliveries: result });
});

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * POST /dispatch
 * Trigger delivery of an event to all matching registered endpoints.
 * Body: { event: string, payload: unknown }
 */
app.post("/dispatch", (req, res) => {
  const { event, payload } = req.body || {};
  if (!event) {
    res.status(400).json({ ok: false, error: "event required" });
    return;
  }

  const targets = endpoints.filter(
    (e) => e.active && (e.events.includes("*") || e.events.includes(event))
  );

  // Fire-and-forget; don't await deliveries
  for (const ep of targets) {
    deliver(ep, event, payload).catch((err) =>
      console.error(`[webhooks-service] delivery error for ${ep.id}: ${err.message}`)
    );
  }

  res.json({ ok: true, event, dispatched: targets.length });
});

/** GET /stats — aggregate delivery and endpoint stats */
app.get("/stats", (_req, res) => {
  const activeEndpoints = endpoints.filter((e) => e.active).length;
  const byStatus = {};
  for (const d of deliveries) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  res.json({ ok: true, stats: { endpoints: { total: endpoints.length, active: activeEndpoints }, deliveries: { total: deliveries.length, ...byStatus }, fetchedAt: new Date().toISOString() } });
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
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[webhooks-service] Listening on port ${PORT}`);
  console.log(`[webhooks-service] HMAC signing: ${WEBHOOK_SECRET ? "enabled" : "disabled (set WEBHOOK_SECRET)"}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.maxConnections = 1024;
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
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
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
