import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT || 7710);
const VAULT_ADDR = process.env.VAULT_ADDR || "http://localhost:8200";
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || "";
const VAULT_TOKEN = process.env.VAULT_TOKEN || "";
const VAULT_ROLE_ID = process.env.VAULT_ROLE_ID || "";
const VAULT_SECRET_ID = process.env.VAULT_SECRET_ID || "";
const FORWARD_CLIENT_TOKEN = process.env.AI_VAULT_FORWARD_CLIENT_TOKEN === "1";
const SERVICES_ROOT = process.env.SERVICES_ROOT || "/services";
const SERVICES_MOUNT = "/services";

const POLICY_PATH = process.env.AI_VAULT_POLICY_PATH || path.resolve(process.cwd(), "policy.example.json");
const POLICY_WRITE = process.env.AI_VAULT_POLICY_WRITE === "1";
const EXECUTE_ACTIONS = process.env.AI_VAULT_EXECUTE === "1";
const DEFAULT_DECISION = (process.env.AI_VAULT_DEFAULT_DECISION || "deny").toLowerCase();

const RATE_WINDOW_MS = Number(process.env.AI_VAULT_RATE_WINDOW_MS || 60_000);
const RATE_LIMIT = Number(process.env.AI_VAULT_RATE_LIMIT || 120);
const BURST_LIMIT = Number(process.env.AI_VAULT_BURST_LIMIT || 40);
const BLOCK_MS = Number(process.env.AI_VAULT_BLOCK_MS || 300_000);
const ROTATE_INTERVAL_MS = Number(process.env.AI_VAULT_ROTATE_INTERVAL_MS || 900_000);

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


let policy = {
  allow: [],
  deny: [],
  rotate: [],
  anomaly: { rateLimitPerMinute: RATE_LIMIT, burst: BURST_LIMIT, blockMs: BLOCK_MS }
};

const state = {
  token: VAULT_TOKEN || "",
  lastLogin: 0,
  blocked: new Map(),
  accessLog: [],
  anomalies: [],
  metrics: {
    requests: 0,
    denied: 0,
    allowed: 0,
    anomalies: 0,
    rotations: 0,
    rotationFails: 0
  }
};

const loadPolicy = () => {
  try {
    const raw = fs.readFileSync(POLICY_PATH, "utf8");
    policy = JSON.parse(raw);
  } catch (err) {
    console.warn(`[ai-vault] policy load failed: ${err?.message || err}`);
  }
};

const savePolicy = () => {
  if (!POLICY_WRITE) return;
  fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
};

loadPolicy();

const recordEvent = (evt) => {
  state.accessLog.push({ ts: Date.now(), ...evt });
  if (state.accessLog.length > 1000) state.accessLog.shift();
};

const hashActor = (token, ip) => {
  return crypto.createHash("sha256").update(`${token || ""}:${ip || ""}`).digest("hex").slice(0, 16);
};

const getActorId = (req) => {
  return req.headers["x-actor-id"] || hashActor(req.headers["x-vault-token"], req.ip);
};

const matchRule = (rule, reqPath, method) => {
  if (rule.methods && !rule.methods.includes(method)) return false;
  if (rule.path && rule.path === reqPath) return true;
  if (rule.pathPrefix && reqPath.startsWith(rule.pathPrefix)) return true;
  return false;
};

const decide = (reqPath, method, actorId) => {
  const now = Date.now();
  const blockedUntil = state.blocked.get(actorId) || 0;
  if (blockedUntil > now) return { decision: "deny", reason: "blocked" };

  for (const rule of policy.deny || []) {
    if (matchRule(rule, reqPath, method)) return { decision: "deny", reason: "policy_deny" };
  }

  for (const rule of policy.allow || []) {
    if (matchRule(rule, reqPath, method)) return { decision: "allow", reason: "policy_allow" };
  }

  return { decision: DEFAULT_DECISION, reason: "default" };
};

const detectAnomaly = (actorId) => {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  const recent = state.accessLog.filter((e) => e.actorId === actorId && e.ts >= windowStart);
  const burst = recent.filter((e) => e.ts >= now - 5_000);
  const limit = policy.anomaly?.rateLimitPerMinute || RATE_LIMIT;
  const burstLimit = policy.anomaly?.burst || BURST_LIMIT;
  if (recent.length > limit || burst.length > burstLimit) {
    return { recent: recent.length, burst: burst.length, limit, burstLimit };
  }
  return null;
};

const maybeBlock = (actorId, anomaly) => {
  state.metrics.anomalies += 1;
  const until = Date.now() + (policy.anomaly?.blockMs || BLOCK_MS);
  state.blocked.set(actorId, until);
  state.anomalies.push({ ts: Date.now(), actorId, anomaly, blockedUntil: until });
  if (state.anomalies.length > 500) state.anomalies.shift();
};

const vaultFetch = async (method, vaultPath, body, tokenOverride) => {
  const url = `${VAULT_ADDR}${vaultPath.startsWith("/v1") ? vaultPath : `/v1/${vaultPath.replace(/^\//, "")}`}`;
  const headers = { "content-type": "application/json" };
  const token = tokenOverride || state.token;
  if (token) headers["x-vault-token"] = token;
  if (VAULT_NAMESPACE) headers["x-vault-namespace"] = VAULT_NAMESPACE;
  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`vault ${resp.status}: ${text.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
};

const loginAppRole = async () => {
  if (!VAULT_ROLE_ID || !VAULT_SECRET_ID) return;
  const resp = await vaultFetch("POST", "/v1/auth/approle/login", {
    role_id: VAULT_ROLE_ID,
    secret_id: VAULT_SECRET_ID
  });
  const token = resp?.auth?.client_token;
  if (token) {
    state.token = token;
    state.lastLogin = Date.now();
    console.log("[ai-vault] logged in via AppRole");
  }
};

const ensureToken = async () => {
  if (state.token) return;
  await loginAppRole();
};

const kvRead = async (mount, secretPath, version = 2) => {
  const v2Path = `/v1/${mount}/data/${secretPath.replace(/^\//, "")}`;
  const v1Path = `/v1/${mount}/${secretPath.replace(/^\//, "")}`;
  return vaultFetch("GET", version === 2 ? v2Path : v1Path);
};

const kvWrite = async (mount, secretPath, data, version = 2) => {
  const v2Path = `/v1/${mount}/data/${secretPath.replace(/^\//, "")}`;
  const v1Path = `/v1/${mount}/${secretPath.replace(/^\//, "")}`;
  const body = version === 2 ? { data } : data;
  return vaultFetch("POST", version === 2 ? v2Path : v1Path, body);
};

const rotateRule = async (rule) => {
  if (!EXECUTE_ACTIONS) return { ok: false, reason: "execute_disabled" };
  const mount = rule.mount || "secret";
  const secretPath = rule.path || "";
  if (!secretPath) return { ok: false, reason: "missing_path" };
  const version = rule.kvVersion || 2;
  const resp = await kvRead(mount, secretPath, version);
  const current = version === 2 ? resp?.data?.data || {} : resp?.data || {};
  const updated = { ...current };
  const keys = rule.keys || Object.keys(current);
  for (const key of keys) {
    const len = rule.keyLength || 32;
    const buf = crypto.randomBytes(len);
    updated[key] = rule.encoding === "hex" ? buf.toString("hex") : buf.toString("base64");
  }
  await kvWrite(mount, secretPath, updated, version);
  return { ok: true, rotated: keys };
};

const rotationLoop = async () => {
  if (!policy.rotate || policy.rotate.length === 0) return;
  for (const rule of policy.rotate) {
    const last = rule._lastRotated || 0;
    const intervalMs = (rule.intervalMinutes || 60) * 60_000;
    if (Date.now() - last < intervalMs) continue;
    try {
      await ensureToken();
      const result = await rotateRule(rule);
      if (result.ok) {
        rule._lastRotated = Date.now();
        state.metrics.rotations += 1;
        recordEvent({ type: "rotation", rule: rule.path, rotated: result.rotated });
      } else {
        state.metrics.rotationFails += 1;
        recordEvent({ type: "rotation_skip", rule: rule.path, reason: result.reason });
      }
    } catch (err) {
      state.metrics.rotationFails += 1;
      recordEvent({ type: "rotation_error", rule: rule.path, error: err?.message || String(err) });
    }
  }
  savePolicy();
};

setInterval(rotationLoop, ROTATE_INTERVAL_MS);

app.get("/health", (_req, res) => res.json({ ok: true, service: "ai-vault" }));

app.get("/status", (_req, res) => {
  const servicesRootExists = fs.existsSync(SERVICES_ROOT);
  const servicesMountExists = fs.existsSync(SERVICES_MOUNT);
  const servicesRootResolved = servicesRootExists ? SERVICES_ROOT : (servicesMountExists ? SERVICES_MOUNT : SERVICES_ROOT);
  res.json({
    ok: true,
    execute: EXECUTE_ACTIONS,
    policyPath: POLICY_PATH,
    defaultDecision: DEFAULT_DECISION,
    blocked: state.blocked.size,
    servicesRoot: SERVICES_ROOT,
    servicesRootExists,
    servicesMount: SERVICES_MOUNT,
    servicesMountExists,
    servicesRootResolved
  });
});

app.get("/policy", (_req, res) => res.json({ ok: true, policy }));
app.put("/policy", (req, res) => {
  policy = req.body || policy;
  savePolicy();
  res.json({ ok: true, policy });
});

app.get("/events", (_req, res) => res.json({ ok: true, events: state.accessLog.slice(-200) }));
app.get("/anomalies", (_req, res) => res.json({ ok: true, anomalies: state.anomalies.slice(-200) }));

app.post("/rotate", async (req, res) => {
  try {
    await ensureToken();
    const rule = req.body || {};
    const result = await rotateRule(rule);
    res.json({ ok: result.ok, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.get("/metrics", (_req, res) => {
  const servicesRootExists = fs.existsSync(SERVICES_ROOT) ? 1 : 0;
  const servicesMountExists = fs.existsSync(SERVICES_MOUNT) ? 1 : 0;
  const servicesRootResolved = servicesRootExists ? SERVICES_ROOT : (servicesMountExists ? SERVICES_MOUNT : SERVICES_ROOT);
  res.type("text/plain").send([
    `ai_vault_requests_total ${state.metrics.requests}`,
    `ai_vault_requests_denied_total ${state.metrics.denied}`,
    `ai_vault_requests_allowed_total ${state.metrics.allowed}`,
    `ai_vault_anomalies_total ${state.metrics.anomalies}`,
    `ai_vault_rotations_total ${state.metrics.rotations}`,
    `ai_vault_rotation_failures_total ${state.metrics.rotationFails}`,
    `ai_vault_services_root_exists ${servicesRootExists}`,
    `ai_vault_services_mount_exists ${servicesMountExists}`,
    `ai_vault_services_root_resolved{path="${servicesRootResolved}"} 1`
  ].join("\n"));
});

app.all(/^\/v1\/.*/, async (req, res) => {
  const reqPath = req.originalUrl.split("?")[0];
  const actorId = getActorId(req);
  const decision = decide(reqPath, req.method, actorId);
  state.metrics.requests += 1;
  recordEvent({ type: "request", actorId, path: reqPath, method: req.method, decision: decision.decision });

  const anomaly = detectAnomaly(actorId);
  if (anomaly) {
    maybeBlock(actorId, anomaly);
  }

  if (decision.decision !== "allow") {
    state.metrics.denied += 1;
    return res.status(403).json({ ok: false, blocked: true, reason: decision.reason });
  }

  try {
    await ensureToken();
    const tokenOverride = FORWARD_CLIENT_TOKEN ? req.headers["x-vault-token"] : undefined;
    const body = Object.keys(req.body || {}).length ? req.body : undefined;
    const vaultResp = await vaultFetch(req.method, reqPath, body, tokenOverride);
    state.metrics.allowed += 1;
    res.json(vaultResp);
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err?.message || String(err) });
  }
});

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
  const servicesRootExists = fs.existsSync(SERVICES_ROOT);
  const servicesMountExists = fs.existsSync(SERVICES_MOUNT);
  const servicesRootResolved = servicesRootExists ? SERVICES_ROOT : (servicesMountExists ? SERVICES_MOUNT : SERVICES_ROOT);
  console.log(
    `[ai-vault] listening on :${PORT}, vault=${VAULT_ADDR}, execute=${EXECUTE_ACTIONS}, servicesRoot=${SERVICES_ROOT}, servicesRootExists=${servicesRootExists}, servicesMount=${SERVICES_MOUNT}, servicesMountExists=${servicesMountExists}, servicesRootResolved=${servicesRootResolved}`
  );
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
