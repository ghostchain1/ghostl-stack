import fs from "node:fs";
import path from "node:path";
import express from "express";
import client from "prom-client";
import { Interface, ghost } from "ghost";

const env = process.env;
const readSecret = (key) => {
  const filePath = env[`${key}_FILE`];
  if (filePath) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return env[key] || "";
};
const registryUrl = env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const rpcOverride = env.RPC_URL || env.RPC_L2 || env.RPC_L1 || env.RPC_L3 || "";
const registryTimeoutMs = Number(env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };
const GUARD_URL = env.GUARD_URL || "http://host.docker.internal:7070";
const ADMIN_TOKEN = readSecret("ADMIN_TOKEN");
const PORT = Number(env.PORT || 7575);
const OBSERVE_ONLY = env.OBSERVE_ONLY === "1";
const SIMULATION_ENABLED = env.SIMULATION_ENABLED === "1";
const TARGET_LAYER = String(env.TARGET_LAYER || "L2").toUpperCase();
const RPC_L1 = env.RPC_L1 || "";
const OP_NODE_RPC_URL = env.OP_NODE_RPC_URL || "";
const OP_BATCHER_METRICS_URL = env.OP_BATCHER_METRICS_URL || "";
const OP_PROPOSER_METRICS_URL = env.OP_PROPOSER_METRICS_URL || "";
const POLICY_REGISTRY_ADDRESS = env.POLICY_REGISTRY_ADDRESS || "";
const POLICY_REGISTRY_RPC = env.POLICY_REGISTRY_RPC || RPC_L1 || "";
const POLICY_ROLE = env.POLICY_ROLE || "L2_AI_MONITOR";
const POLICY_ACTION_THROTTLE = env.POLICY_ACTION_THROTTLE || "L2_AI_THROTTLE";
const POLICY_ACTION_PAUSE = env.POLICY_ACTION_PAUSE || "L2_AI_PAUSE";
const POLICY_APPROVALS_PROVIDED = Math.max(0, Number(env.POLICY_APPROVALS_PROVIDED || 0));
const POLICY_HAS_EVIDENCE_RAW = env.POLICY_HAS_EVIDENCE;
const POLICY_HAS_EVIDENCE = env.POLICY_HAS_EVIDENCE === "1";
const POLICY_REQUIRED = env.POLICY_REQUIRED ? env.POLICY_REQUIRED === "1" : !OBSERVE_ONLY;
const POLICY_CACHE_MS = Math.max(1000, Number(env.POLICY_CACHE_MS || 10000));
const CHAIN_POLICY_REGISTRY_ADDRESS = env.CHAIN_POLICY_REGISTRY_ADDRESS || "";
const CHAIN_POLICY_REGISTRY_RPC = env.CHAIN_POLICY_REGISTRY_RPC || POLICY_REGISTRY_RPC || RPC_L1 || "";
const CHAIN_POLICY_REQUIRED = env.CHAIN_POLICY_REQUIRED ? env.CHAIN_POLICY_REQUIRED === "1" : false;
const CHAIN_POLICY_CACHE_MS = Math.max(1000, Number(env.CHAIN_POLICY_CACHE_MS || 15000));
const THROTTLE_THRESHOLD = Number(env.THROTTLE_THRESHOLD || 70);
const PAUSE_THRESHOLD = Number(env.PAUSE_THRESHOLD || 90);
const BASE_DELAY_MS = Number(env.BASE_DELAY_MS || 2000);
const MAX_DELAY_MS = Number(env.MAX_DELAY_MS || 8000);
const LOOP_MS = Number(env.LOOP_MS || 5000);
const HEAD_LAG_THRESHOLD_SEC = Number(env.HEAD_LAG_THRESHOLD_SEC || 30);
const L1_HEAD_LAG_THRESHOLD_SEC = Number(env.L1_HEAD_LAG_THRESHOLD_SEC || 120);
const BATCHER_IDLE_THRESHOLD_SEC = Number(env.BATCHER_IDLE_THRESHOLD_SEC || 900);
const PROPOSER_IDLE_THRESHOLD_SEC = Number(env.PROPOSER_IDLE_THRESHOLD_SEC || 900);
const MIN_PEERS = Number(env.MIN_PEERS || 1);
const REORG_PENALTY = Number(env.REORG_PENALTY || 15);
const STALE_PENALTY = Number(env.STALE_PENALTY || 25);
const SYNCING_PENALTY = Number(env.SYNCING_PENALTY || 20);
const LOW_PEER_PENALTY = Number(env.LOW_PEER_PENALTY || 15);
const L1_RPC_PENALTY = Number(env.L1_RPC_PENALTY || 30);
const OP_NODE_PENALTY = Number(env.OP_NODE_PENALTY || 25);
const BATCHER_STALL_PENALTY = Number(env.BATCHER_STALL_PENALTY || 20);
const PROPOSER_STALL_PENALTY = Number(env.PROPOSER_STALL_PENALTY || 20);
const METRICS_PENALTY = Number(env.METRICS_PENALTY || 10);
const DEPENDENCY_TIMEOUT_MS = Number(env.DEPENDENCY_TIMEOUT_MS || 1500);
const ACTION_EVIDENCE_ENABLED = env.ACTION_EVIDENCE_ENABLED === "1";
const ACTION_EVIDENCE_OUTPUT_DIR = env.ACTION_EVIDENCE_OUTPUT_DIR || "";
const ACTION_EVIDENCE_KIND = env.ACTION_EVIDENCE_KIND || "ghost.ai.monitor.action";
const LAYER_TAG = TARGET_LAYER.toLowerCase();
const LAYER_RPC_INCIDENT = `${LAYER_TAG}_rpc_unreachable`;
const LAYER_HEAD_STALE = `${LAYER_TAG}_head_stale`;
const PARENT_RPC_INCIDENT = `${LAYER_TAG}_parent_rpc_unreachable`;
const PARENT_HEAD_STALE = `${LAYER_TAG}_parent_head_stale`;

const app = express();
process.title = process.env.npm_package_name ?? 'ghoststack';
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
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const _tp = req.headers["traceparent"] ?? `00-${crypto.randomUUID().replace(/-/g,"")}-${req.id.replace(/-/g,"").slice(0,16)}-01`;
  res.setHeader("X-Trace-ID", _tp);
  const _spanId = crypto.randomUUID().replace(/-/g,"").slice(0,16);
  res.setHeader("X-Span-ID", _spanId);
  const _sfs = req.headers["sec-fetch-site"];
  if (_sfs && _sfs !== "same-origin" && _sfs !== "same-site" && _sfs !== "none" && !["GET","HEAD","OPTIONS"].includes(req.method)) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "sec_fetch_cross_site", method: req.method, url: req.url, sfs: _sfs, reqId: req.id }));
  }
  const t0 = process.hrtime.bigint();
  res.on("prefinish", () => { const _ms = (Number(process.hrtime.bigint()-t0)/1e6).toFixed(2); res.setHeader("X-Response-Time", `${_ms}ms`); res.setHeader("Server-Timing", `total;dur=${_ms}`); });
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


const logEvent = (level, message, extra = {}) => {
  const payload = { ts: new Date().toISOString(), level, message, layer: TARGET_LAYER, ...extra };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
};

const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const hashJson = (value) => ghost.keccak256(ghost.toUtf8Bytes(stableStringify(value)));

const writeEvidenceFile = (bundle, evidenceHash) => {
  if (!ACTION_EVIDENCE_OUTPUT_DIR) return null;
  fs.mkdirSync(ACTION_EVIDENCE_OUTPUT_DIR, { recursive: true });
  const filePath = path.join(ACTION_EVIDENCE_OUTPUT_DIR, `action-evidence-${TARGET_LAYER}-${evidenceHash}.json`);
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), "utf8");
  return filePath;
};

const buildActionEvidence = (actionType, context) => {
  if (!ACTION_EVIDENCE_ENABLED) return null;
  const issuedAt = context?.blockTimestamp
    ? new Date(context.blockTimestamp * 1000).toISOString()
    : new Date().toISOString();
  const bundle = {
    version: "1",
    kind: ACTION_EVIDENCE_KIND,
    layer: TARGET_LAYER,
    action: actionType,
    policyRole: POLICY_ROLE,
    policyAction: actionType === "pause" ? POLICY_ACTION_PAUSE : POLICY_ACTION_THROTTLE,
    risk: context?.risk,
    congestion: context?.congestion,
    anomaly: context?.anomaly,
    headLag: context?.headLag,
    l1HeadLag: context?.l1HeadLag,
    peers: context?.peers,
    incidents: context?.incidents || [],
    headNumber: context?.headNumber,
    headHash: context?.headHash,
    issuedAt
  };
  const evidenceHash = hashJson(bundle);
  const metadataHash = hashJson({ actionType, layer: TARGET_LAYER, issuedAt });
  const outputPath = writeEvidenceFile(bundle, evidenceHash);
  return { bundle, evidenceHash, metadataHash, outputPath };
};

const resolveHasEvidence = (evidence) => {
  if (POLICY_HAS_EVIDENCE_RAW === "1") return true;
  if (POLICY_HAS_EVIDENCE_RAW === "0") return false;
  return Boolean(evidence?.evidenceHash);
};

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const riskGauge = new client.Gauge({ name: "ai_monitor_risk_score", help: "Latest risk score 0-100" });
const anomalyGauge = new client.Gauge({ name: "ai_monitor_anomaly_score", help: "Latest anomaly score 0-100" });
const congestionGauge = new client.Gauge({ name: "ai_monitor_congestion_score", help: "Latest congestion score 0-100" });
const actionGauge = new client.Gauge({ name: "ai_monitor_last_action", help: "0=none,1=delay,2=pause" });
const headLagGauge = new client.Gauge({ name: "ai_monitor_head_lag_seconds", help: "Head lag in seconds" });
const l1HeadLagGauge = new client.Gauge({ name: "ai_monitor_l1_head_lag_seconds", help: "L1 head lag in seconds" });
const peerGauge = new client.Gauge({ name: "ai_monitor_peer_count", help: "Latest peer count" });
const syncingGauge = new client.Gauge({ name: "ai_monitor_syncing", help: "1 if syncing" });
const reorgCounter = new client.Counter({ name: "ai_monitor_reorgs_total", help: "Detected head reorgs" });
const incidentGauge = new client.Gauge({
  name: "ai_monitor_incident_active",
  help: "Active incident flags by type",
  labelNames: ["type"]
});
const policyGauge = new client.Gauge({
  name: "ai_monitor_policy_allowed",
  help: "Policy registry allow/deny status by action",
  labelNames: ["action"]
});
const chainPolicyGauge = new client.Gauge({
  name: "ai_monitor_chain_policy_registry_ok",
  help: "Chain policy registry reachable and has bytecode (1=ok,0=fail)"
});
registry.registerMetric(riskGauge);
registry.registerMetric(anomalyGauge);
registry.registerMetric(congestionGauge);
registry.registerMetric(actionGauge);
registry.registerMetric(headLagGauge);
registry.registerMetric(l1HeadLagGauge);
registry.registerMetric(peerGauge);
registry.registerMetric(syncingGauge);
registry.registerMetric(reorgCounter);
registry.registerMetric(incidentGauge);
registry.registerMetric(policyGauge);
registry.registerMetric(chainPolicyGauge);

const headers = ADMIN_TOKEN ? { "content-type": "application/json", "x-admin-token": ADMIN_TOKEN } : { "content-type": "application/json" };

const policyIface = new Interface(["function canExecute(bytes32,bytes32,uint16,bool) view returns (bool)"]);
const policyCache = new Map();
const chainPolicyCache = { ok: null, missing: false, expiresAt: 0 };

const normalizePolicyId = (value, label) => {
  if (!value) return null;
  if (ghost.isHexString(value, 32)) return value;
  try {
    return ghost.id(value);
  } catch (err) {
    logEvent("warn", "policy_hash_error", { label, value, error: err?.message || String(err) });
    return null;
  }
};

const cachePolicyResult = (key, allowed) => {
  policyCache.set(key, { allowed, expiresAt: Date.now() + POLICY_CACHE_MS });
};

const readPolicyCache = (key) => {
  const entry = policyCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    policyCache.delete(key);
    return null;
  }
  return entry.allowed;
};

const policyAllows = async (actionValue, hasEvidenceOverride) => {
  if (!POLICY_REGISTRY_ADDRESS || !POLICY_REGISTRY_RPC) {
    return POLICY_REQUIRED ? false : true;
  }
  const roleHash = normalizePolicyId(POLICY_ROLE, "role");
  const actionHash = normalizePolicyId(actionValue, "action");
  if (!roleHash || !actionHash) return POLICY_REQUIRED ? false : true;
  const hasEvidence = typeof hasEvidenceOverride === "boolean" ? hasEvidenceOverride : POLICY_HAS_EVIDENCE;
  const cacheKey = `${roleHash}:${actionHash}:${hasEvidence ? 1 : 0}:${POLICY_APPROVALS_PROVIDED}`;
  const cached = readPolicyCache(cacheKey);
  if (cached !== null) return cached;
  const data = policyIface.encodeFunctionData("canExecute", [
    roleHash,
    actionHash,
    POLICY_APPROVALS_PROVIDED,
    hasEvidence
  ]);
  const result = await rpcRequest(POLICY_REGISTRY_RPC, "ghost_call", [
    { to: POLICY_REGISTRY_ADDRESS, data },
    "latest"
  ]);
  const allowed = ghost.getBigInt(result) > 0n;
  cachePolicyResult(cacheKey, allowed);
  return allowed;
};

const checkChainPolicyRegistry = async () => {
  if (!CHAIN_POLICY_REGISTRY_ADDRESS || !CHAIN_POLICY_REGISTRY_RPC) {
    return { ok: !CHAIN_POLICY_REQUIRED, missing: false };
  }
  const now = Date.now();
  if (chainPolicyCache.expiresAt > now && chainPolicyCache.ok !== null) {
    return { ok: chainPolicyCache.ok, missing: chainPolicyCache.missing };
  }
  try {
    const code = await rpcRequest(CHAIN_POLICY_REGISTRY_RPC, "ghost_getCode", [
      CHAIN_POLICY_REGISTRY_ADDRESS,
      "latest"
    ]);
    const missing = !code || code === "0x";
    chainPolicyCache.ok = !missing;
    chainPolicyCache.missing = missing;
    chainPolicyCache.expiresAt = now + CHAIN_POLICY_CACHE_MS;
    return { ok: !missing, missing };
  } catch {
    chainPolicyCache.ok = false;
    chainPolicyCache.missing = false;
    chainPolicyCache.expiresAt = now + CHAIN_POLICY_CACHE_MS;
    return { ok: false, missing: false };
  }
};

const fetchRegistry = async () => {
  const now = Date.now();
  if (registryCache.data && registryCache.expiresAt > now) return registryCache.data;
  let lastErr;
  for (let attempt = 0; attempt <= registryRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), registryTimeoutMs);
    try {
      const res = await fetch(registryUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`registry_http_${res.status}`);
      const body = await res.json();
      if (!body || !Array.isArray(body.chains)) throw new Error("registry_invalid");
      registryCache.data = body;
      registryCache.expiresAt = now + registryCacheMs;
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt < registryRetries) await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr || new Error("registry_unavailable");
};

const pickRpc = (chain) => {
  if (!chain) return "";
  if (typeof chain.rpc === "string" && chain.rpc) return chain.rpc;
  if (Array.isArray(chain.rpcUrls) && chain.rpcUrls.length) return chain.rpcUrls[0];
  if (Array.isArray(chain.endpoints)) {
    const http = chain.endpoints.find((endpoint) => endpoint.protocol === "http");
    if (http?.url) return http.url;
  }
  if (typeof chain.ws === "string" && chain.ws) return chain.ws;
  if (Array.isArray(chain.wsUrls) && chain.wsUrls.length) return chain.wsUrls[0];
  return "";
};

const resolveRpc = async () => {
  if (rpcOverride) return rpcOverride;
  const registry = await fetchRegistry();
  const chain = registry.chains.find((entry) => String(entry.layer || "").toUpperCase() === TARGET_LAYER);
  const rpc = pickRpc(chain);
  if (!rpc) throw new Error(`rpc_missing_${TARGET_LAYER.toLowerCase()}`);
  return rpc;
};

let rpcL2 = "";
let lastHeadNumber = null;
let lastHeadHash = null;
let lastStatus = {
  updatedAt: null,
  risk: 0,
  anomaly: 0,
  congestion: 0,
  headLag: 0,
  peers: 0,
  syncing: false,
  incidents: [],
  recommendedAction: "none",
  recommendedFix: ""
};
let simulation = null;

const parseHexNumber = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    try {
      return Number(BigInt(value));
    } catch {
      return fallback;
    }
  }
  return fallback;
};

async function rpcRequest(url, method, params = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPENDENCY_TIMEOUT_MS);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`RPC ${method} status ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method} error: ${body.error.message || body.error}`);
  return body.result;
}

async function rpc(method, params = []) {
  return rpcRequest(rpcL2, method, params);
}

const parseMetricValue = (text, name, labelMatcher = "") => {
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    if (!line.startsWith(name)) continue;
    if (labelMatcher && !line.includes(labelMatcher)) continue;
    const parts = line.trim().split(/\s+/);
    const value = parts[parts.length - 1];
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const fetchMetricValue = async (url, name, labelMatcher = "") => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPENDENCY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`metrics_status_${res.status}`);
    const text = await res.text();
    return parseMetricValue(text, name, labelMatcher);
  } finally {
    clearTimeout(timeout);
  }
};

async function setDelay(seconds) {
  if (OBSERVE_ONLY) return;
  await fetch(`${GUARD_URL}/policy/delay`, {
    method: "POST",
    headers,
    body: JSON.stringify({ seconds })
  });
}

async function maybeAdjustPolicy(score, congestion, policyAllowed, context) {
  actionGauge.set(0);
  if (score >= PAUSE_THRESHOLD) {
    // For now, use a high delay instead of hard pause to avoid mode flapping.
    const evidence = buildActionEvidence("pause", context);
    const hasEvidence = resolveHasEvidence(evidence);
    let pauseAllowed = policyAllowed.pause;
    if (!pauseAllowed && ACTION_EVIDENCE_ENABLED) {
      pauseAllowed = await policyAllows(POLICY_ACTION_PAUSE, hasEvidence);
    }
    if (!pauseAllowed) {
      if (evidence?.evidenceHash) {
        logEvent("warn", "policy_denied_action", { action: "pause", evidenceHash: evidence.evidenceHash });
      }
      return "none";
    }
    if (evidence?.outputPath) {
      logEvent("info", "action_evidence_written", { action: "pause", path: evidence.outputPath });
    }
    const secs = Math.min(MAX_DELAY_MS / 1000, 10);
    await setDelay(secs);
    actionGauge.set(2);
    return "pause";
  }
  if (score >= THROTTLE_THRESHOLD || congestion >= THROTTLE_THRESHOLD) {
    const evidence = buildActionEvidence("delay", context);
    const hasEvidence = resolveHasEvidence(evidence);
    let throttleAllowed = policyAllowed.throttle;
    if (!throttleAllowed && ACTION_EVIDENCE_ENABLED) {
      throttleAllowed = await policyAllows(POLICY_ACTION_THROTTLE, hasEvidence);
    }
    if (!throttleAllowed) {
      if (evidence?.evidenceHash) {
        logEvent("warn", "policy_denied_action", { action: "delay", evidenceHash: evidence.evidenceHash });
      }
      return "none";
    }
    if (evidence?.outputPath) {
      logEvent("info", "action_evidence_written", { action: "delay", path: evidence.outputPath });
    }
    const factor = Math.min(1, Math.max(score, congestion) / 100);
    const delayMs = Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, BASE_DELAY_MS * factor * 2));
    await setDelay(Math.round(delayMs / 1000));
    actionGauge.set(1);
    return "delay";
  }
  // Clear delay if low risk.
  if (policyAllowed.throttle) {
    await setDelay(0);
  }
  return "none";
}

function computeScores(latestBlock) {
  const gasUsed = parseHexNumber(latestBlock.gasUsed, 0);
  const gasLimit = parseHexNumber(latestBlock.gasLimit, 1);
  const gasRatio = gasLimit > 0 ? gasUsed / gasLimit : 0;
  const txCount = Array.isArray(latestBlock.transactions) ? latestBlock.transactions.length : 0;
  const congestion = Math.min(100, Math.round(gasRatio * 100));

  // Very simple risk heuristic: heavier blocks + more txs => higher score.
  let risk = congestion;
  if (txCount > 50) risk = Math.min(100, risk + 10);
  if (txCount > 100) risk = Math.min(100, risk + 10);

  return { risk, congestion, txCount, gasRatio };
}

function classifyIncidents({
  syncing,
  headLag,
  peers,
  reorged,
  rpcError,
  l1RpcError,
  opNodeError,
  l1HeadLag,
  batcherStalled,
  proposerStalled,
  batcherMetricsError,
  proposerMetricsError,
  policyDenied,
  policyUnavailable,
  chainPolicyUnavailable,
  chainPolicyMissing
}) {
  const incidents = [];
  if (rpcError) incidents.push(LAYER_RPC_INCIDENT);
  if (l1RpcError) incidents.push(PARENT_RPC_INCIDENT);
  if (opNodeError) incidents.push("op_node_unreachable");
  if (syncing) incidents.push("syncing");
  if (headLag > HEAD_LAG_THRESHOLD_SEC) incidents.push(LAYER_HEAD_STALE);
  if (l1HeadLag > L1_HEAD_LAG_THRESHOLD_SEC) incidents.push(PARENT_HEAD_STALE);
  if (peers < MIN_PEERS) incidents.push("low_peers");
  if (reorged) incidents.push("reorg_detected");
  if (batcherStalled) incidents.push("batcher_stalled");
  if (proposerStalled) incidents.push("proposer_stalled");
  if (batcherMetricsError) incidents.push("batcher_metrics_unreachable");
  if (proposerMetricsError) incidents.push("proposer_metrics_unreachable");
  if (policyUnavailable) incidents.push("policy_registry_unreachable");
  if (policyDenied) incidents.push("policy_denied");
  if (chainPolicyUnavailable) incidents.push("chain_policy_registry_unreachable");
  if (chainPolicyMissing) incidents.push("chain_policy_registry_missing");
  return incidents;
}

function recommendFix(incidents) {
  if (!incidents.length) return "";
  if (incidents.includes(LAYER_RPC_INCIDENT)) return `Check ${TARGET_LAYER} RPC proxy/container health, restart node if needed.`;
  if (incidents.includes(PARENT_RPC_INCIDENT)) return `Check ${TARGET_LAYER} parent RPC and network connectivity.`;
  if (incidents.includes("op_node_unreachable")) return "Check op-node health and restart if needed.";
  if (incidents.includes("syncing")) return "Node syncing; verify disk IO and peer connectivity.";
  if (incidents.includes(LAYER_HEAD_STALE)) return `Investigate ${TARGET_LAYER} node lag; check CPU/memory and peer count.`;
  if (incidents.includes(PARENT_HEAD_STALE)) return `Investigate ${TARGET_LAYER} parent RPC lag and op-node derivation.`;
  if (incidents.includes("low_peers")) return "Check P2P connectivity and firewall rules.";
  if (incidents.includes("reorg_detected")) return "Investigate validator health and network stability.";
  if (incidents.includes("batcher_stalled")) return "Restart op-batcher and verify batcher key/parent RPC.";
  if (incidents.includes("proposer_stalled")) return "Restart op-proposer and verify proposer key/parent RPC.";
  if (incidents.includes("batcher_metrics_unreachable")) return "Check op-batcher metrics endpoint or container health.";
  if (incidents.includes("proposer_metrics_unreachable")) return "Check op-proposer metrics endpoint or container health.";
  if (incidents.includes("policy_registry_unreachable")) return "Check L1 policy registry RPC/address and network connectivity.";
  if (incidents.includes("policy_denied")) return "AI action blocked by on-chain policy; submit governance proposal to adjust.";
  if (incidents.includes("chain_policy_registry_unreachable")) return "Check chain policy registry RPC/address and network connectivity.";
  if (incidents.includes("chain_policy_registry_missing")) return "Chain policy registry missing bytecode; verify deployment address.";
  return "";
}

async function loop() {
  try {
    let latestBlock;
    let peersRaw = "0x0";
    let syncing = false;
    let rpcError = false;
    let l1RpcError = false;
    let opNodeError = false;
    let l1HeadLag = 0;
    let batcherStalled = false;
    let proposerStalled = false;
    let batcherMetricsError = false;
    let proposerMetricsError = false;
    let policyDenied = false;
    let policyUnavailable = false;
    let chainPolicyUnavailable = false;
    let chainPolicyMissing = false;
    if (simulation?.active) {
      latestBlock = simulation.latestBlock;
      peersRaw = simulation.peersRaw ?? "0x0";
      syncing = simulation.syncing ?? false;
    } else {
      latestBlock = await rpc("ghost_getBlockByNumber", ["latest", true]);
      peersRaw = await rpc("net_peerCount");
      syncing = await rpc("ghost_syncing");
    }
    const peers = parseHexNumber(peersRaw, 0);
    const headNumber = parseHexNumber(latestBlock.number, null);
    const headHash = latestBlock.hash || null;
    let reorged = false;
    if (headNumber !== null && lastHeadNumber !== null) {
      if (headNumber < lastHeadNumber || (headNumber === lastHeadNumber && headHash && headHash !== lastHeadHash)) {
        reorgCounter.inc();
        reorged = true;
      }
    }
    lastHeadNumber = headNumber;
    lastHeadHash = headHash;

    const headTs = parseHexNumber(latestBlock.timestamp, null);
    const nowSec = Math.floor(Date.now() / 1000);
    const headLag = headTs ? Math.max(0, nowSec - headTs) : 0;

    if (RPC_L1) {
      try {
        await rpcRequest(RPC_L1, "ghost_chainId");
      } catch {
        l1RpcError = true;
      }
    }

    if (OP_NODE_RPC_URL) {
      try {
        const status = await rpcRequest(OP_NODE_RPC_URL, "optimism_syncStatus");
        const headL1Ts = parseHexNumber(status?.head_l1?.timestamp, 0);
        if (headL1Ts > 0) {
          l1HeadLag = Math.max(0, nowSec - headL1Ts);
        } else if (headLag > 0) {
          l1HeadLag = headLag;
        }
      } catch {
        opNodeError = true;
      }
    }

    if (OP_BATCHER_METRICS_URL) {
      try {
        const lastBatch = await fetchMetricValue(
          OP_BATCHER_METRICS_URL,
          "op_batcher_default_last_batcher_tx_unix",
          'stage="success"'
        );
        if (!lastBatch || Number.isNaN(lastBatch)) {
          batcherStalled = true;
        } else {
          const idle = Math.max(0, nowSec - Math.floor(lastBatch));
          if (idle > BATCHER_IDLE_THRESHOLD_SEC) batcherStalled = true;
        }
      } catch {
        batcherMetricsError = true;
      }
    }

    if (OP_PROPOSER_METRICS_URL) {
      try {
        const lastPublish = await fetchMetricValue(
          OP_PROPOSER_METRICS_URL,
          "op_proposer_default_txmgr_last_publish_unix"
        );
        if (!lastPublish || Number.isNaN(lastPublish)) {
          proposerStalled = true;
        } else {
          const idle = Math.max(0, nowSec - Math.floor(lastPublish));
          if (idle > PROPOSER_IDLE_THRESHOLD_SEC) proposerStalled = true;
        }
      } catch {
        proposerMetricsError = true;
      }
    }

    let anomaly = 0;
    if (syncing && syncing !== false) anomaly = Math.min(100, anomaly + SYNCING_PENALTY);
    if (headLag > HEAD_LAG_THRESHOLD_SEC) anomaly = Math.min(100, anomaly + STALE_PENALTY);
    if (l1HeadLag > L1_HEAD_LAG_THRESHOLD_SEC) anomaly = Math.min(100, anomaly + STALE_PENALTY);
    if (peers < MIN_PEERS) anomaly = Math.min(100, anomaly + LOW_PEER_PENALTY);
    if (l1RpcError) anomaly = Math.min(100, anomaly + L1_RPC_PENALTY);
    if (opNodeError) anomaly = Math.min(100, anomaly + OP_NODE_PENALTY);
    if (batcherStalled) anomaly = Math.min(100, anomaly + BATCHER_STALL_PENALTY);
    if (proposerStalled) anomaly = Math.min(100, anomaly + PROPOSER_STALL_PENALTY);
    if (batcherMetricsError || proposerMetricsError) anomaly = Math.min(100, anomaly + METRICS_PENALTY);
    anomalyGauge.set(anomaly);
    headLagGauge.set(headLag);
    l1HeadLagGauge.set(l1HeadLag);
    peerGauge.set(peers);
    syncingGauge.set(syncing && syncing !== false ? 1 : 0);

    const { risk: congestionRisk, congestion } = computeScores(latestBlock);
    const risk = Math.min(100, Math.max(congestionRisk, anomaly));
    riskGauge.set(risk);
    congestionGauge.set(congestion);
    let policyAllowed = { throttle: true, pause: true };
    if (!OBSERVE_ONLY && (POLICY_REQUIRED || POLICY_REGISTRY_ADDRESS)) {
      try {
        const [throttleAllowed, pauseAllowed] = await Promise.all([
          policyAllows(POLICY_ACTION_THROTTLE),
          policyAllows(POLICY_ACTION_PAUSE)
        ]);
        policyAllowed = { throttle: throttleAllowed, pause: pauseAllowed };
        if (!throttleAllowed || !pauseAllowed) policyDenied = true;
      } catch (err) {
        policyUnavailable = true;
        policyAllowed = { throttle: !POLICY_REQUIRED, pause: !POLICY_REQUIRED };
        logEvent("warn", "policy_check_failed", { error: err?.message || String(err) });
      }
    }
    policyGauge.labels("throttle").set(policyAllowed.throttle ? 1 : 0);
    policyGauge.labels("pause").set(policyAllowed.pause ? 1 : 0);
    if (CHAIN_POLICY_REGISTRY_ADDRESS || CHAIN_POLICY_REQUIRED) {
      const chainPolicy = await checkChainPolicyRegistry();
      chainPolicyUnavailable = !chainPolicy.ok;
      chainPolicyMissing = chainPolicy.missing;
    }
    chainPolicyGauge.set(!chainPolicyUnavailable && !chainPolicyMissing ? 1 : 0);

    const incidents = classifyIncidents({
      syncing: syncing && syncing !== false,
      headLag,
      peers,
      reorged,
      rpcError,
      l1RpcError,
      opNodeError,
      l1HeadLag,
      batcherStalled,
      proposerStalled,
      batcherMetricsError,
      proposerMetricsError,
      policyDenied,
      policyUnavailable,
      chainPolicyUnavailable,
      chainPolicyMissing
    });
    incidentGauge.reset();
    incidents.forEach((type) => incidentGauge.labels(type).set(1));
    const evidenceContext = {
      risk,
      congestion,
      anomaly,
      headLag,
      l1HeadLag,
      peers,
      incidents,
      headNumber: latestBlock?.number ?? null,
      headHash: latestBlock?.hash ?? null,
      blockTimestamp: parseHexNumber(latestBlock?.timestamp, 0)
    };
    const action = await maybeAdjustPolicy(risk, congestion, policyAllowed, evidenceContext);
    const recommendedAction = action === "pause" ? "throttle_hard" : action === "delay" ? "throttle" : "observe";
    const recommendedFix = recommendFix(incidents);
    lastStatus = {
      updatedAt: new Date().toISOString(),
      risk,
      anomaly,
      congestion,
      headLag,
      l1HeadLag,
      peers,
      syncing: syncing && syncing !== false,
      incidents,
      recommendedAction,
      recommendedFix,
      batcherStalled,
      proposerStalled,
      l1RpcError,
      opNodeError,
      policy: {
        required: POLICY_REQUIRED,
        registry: POLICY_REGISTRY_ADDRESS || null,
        role: POLICY_ROLE,
        throttleAllowed: policyAllowed.throttle,
        pauseAllowed: policyAllowed.pause,
        lastCheckAt: new Date().toISOString(),
        chainPolicyRegistry: CHAIN_POLICY_REGISTRY_ADDRESS || null,
        chainPolicyRequired: CHAIN_POLICY_REQUIRED,
        chainPolicyOk: !chainPolicyUnavailable && !chainPolicyMissing
      }
    };
    if (incidents.length) {
      logEvent("warn", "incidents_detected", { incidents, risk, anomaly, congestion, action: recommendedAction });
    }
  } catch (e) {
    lastStatus = {
      updatedAt: new Date().toISOString(),
      risk: 100,
      anomaly: 100,
      congestion: 0,
      headLag: 0,
      peers: 0,
      syncing: false,
      incidents: [LAYER_RPC_INCIDENT],
      recommendedAction: "throttle",
      recommendedFix: "Check RPC proxy/container health, restart node if needed."
    };
    incidentGauge.reset();
    incidentGauge.labels(LAYER_RPC_INCIDENT).set(1);
    logEvent("error", "loop_error", { error: e?.message || String(e) });
  } finally {
    setTimeout(loop, LOOP_MS);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    rpc: rpcL2,
    guard: GUARD_URL,
    observeOnly: OBSERVE_ONLY,
    layer: TARGET_LAYER,
    rpcOverride: Boolean(rpcOverride),
    policyRegistry: POLICY_REGISTRY_ADDRESS || null,
    policyRequired: POLICY_REQUIRED,
    chainPolicyRegistry: CHAIN_POLICY_REGISTRY_ADDRESS || null,
    chainPolicyRequired: CHAIN_POLICY_REQUIRED
  });
});

app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    layer: TARGET_LAYER,
    observeOnly: OBSERVE_ONLY,
    simulationEnabled: SIMULATION_ENABLED,
    status: lastStatus
  });
});

app.post("/simulate", (req, res) => {
  if (!SIMULATION_ENABLED) return res.status(403).json({ ok: false, error: "simulation_disabled" });
  const body = req.body || {};
  const durationSec = Number(body.durationSec || 30);
  simulation = {
    active: true,
    expiresAt: Date.now() + durationSec * 1000,
    latestBlock: body.latestBlock || {
      number: body.headNumber ?? "0x0",
      hash: body.headHash ?? "0x0",
      timestamp: body.headTimestamp ?? "0x0",
      gasUsed: body.gasUsed ?? "0x0",
      gasLimit: body.gasLimit ?? "0x1",
      transactions: body.transactions ?? []
    },
    peersRaw: body.peersRaw ?? "0x0",
    syncing: body.syncing ?? false
  };
  res.json({ ok: true, simulation });
});

setInterval(() => {
  if (simulation?.active && simulation.expiresAt <= Date.now()) {
    simulation = null;
  }
}, 1000);

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
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

async function init() {
    const server = app.listen(PORT, "0.0.0.0", () => {
      logEvent("info", "ai_monitor_listen", {
        port: PORT,
        rpc: rpcL2,
        guard: GUARD_URL,
        observeOnly: OBSERVE_ONLY
      });
      loop();
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
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGUSR2", () => {
  const m = process.memoryUsage();
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sigusr2_diag", pid: process.pid, rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external }));
});
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
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGQUIT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
  } catch (err) {
    logEvent("error", "registry_error", { error: err?.message || String(err) });
    process.exit(1);
  }
}

init();
