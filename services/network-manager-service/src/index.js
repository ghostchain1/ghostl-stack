import express from "express";
import net from "net";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { ghost } from "ghost";
import Docker from "dockerode";

const PORT = Number(process.env.NETWORK_MANAGER_PORT || "7766");
const MONITOR_HOST = process.env.MONITOR_HOST || "localhost";
const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || "1500");
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || "2"));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || "30000"));
const registryCache = { data: null, expiresAt: 0 };
const PORTS = (process.env.MONITOR_PORTS || "7070,7171,18545,29547,39545")
  .split(",")
  .map((p) => Number(p.trim()))
  .filter(Boolean);
const HEALTH_ENDPOINTS = (process.env.MONITOR_HEALTH_ENDPOINTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const AUTONOMY_EXECUTION_ENABLED = process.env.AUTONOMY_EXECUTION_ENABLED === "true";
const AUTONOMY_KILL_SWITCH = process.env.AUTONOMY_KILL_SWITCH === "true";
const AUTONOMY_PROD_LOCK = process.env.AUTONOMY_PROD_LOCK !== "false";
const NET_ENV = String(process.env.NET_ENV || "").toLowerCase();
const PROD_LOCK_ACTIVE =
  AUTONOMY_PROD_LOCK && (NET_ENV === "prod" || process.env.PRODUCTION === "true" || process.env.NODE_ENV === "production");
const REQUIRE_TELEMETRY = process.env.REQUIRE_TELEMETRY !== "false";
const REQUIRE_GOVERNANCE = process.env.REQUIRE_GOVERNANCE !== "false";
const REQUIRE_PAUSE_GUARDIAN = process.env.REQUIRE_PAUSE_GUARDIAN !== "false";
const DOCKER_ACTIONS_ENABLED = process.env.DOCKER_ACTIONS_ENABLED === "true";
const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock";

const EXECUTION_TOKEN = process.env.EXECUTION_APPROVAL_TOKEN || "";

const CONSENSUS_TELEMETRY_URL =
  process.env.CONSENSUS_TELEMETRY_URL || "http://consensus-telemetry-service:7635/consensus";

const OP_GATE_URL = process.env.OP_GATE_URL || "http://op-gate:8545";
const OP_GATE_URL_L3 = process.env.OP_GATE_URL_L3 || "";
const OP_GATE_ADMIN_TOKEN = process.env.OP_GATE_ADMIN_TOKEN || process.env.GATE_ADMIN_TOKEN || "";

const GOVERNANCE_RPC =
  process.env.GOVERNANCE_RPC_L1 ||
  process.env.GOVERNANCE_RPC ||
  process.env.RPC_L1 ||
  process.env.MONITOR_RPC_L1 ||
  "";
const GOVERNOR_ADDRESS =
  process.env.GOVERNOR_ADDRESS_L1 ||
  process.env.GOVERNOR_ADDRESS ||
  process.env.GOVERNANCE_CONTRACT_ADDRESS ||
  "";
const EVIDENCE_ANCHOR_ADDRESS = process.env.EVIDENCE_ANCHOR_ADDRESS || "";
const PAUSE_GUARDIAN_ADDRESS = process.env.PAUSE_GUARDIAN_ADDRESS || "";

const POLICY_PATH = process.env.ACTION_POLICY_PATH || path.join(process.cwd(), "data", "action-policy.json");
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || path.join(process.cwd(), "data", "evidence");

const PLAN_TTL_MS = Math.max(5 * 60_000, Number(process.env.PLAN_TTL_MS || 30 * 60_000));
const DRY_RUN_MAX_AGE_MS = Math.max(60_000, Number(process.env.DRY_RUN_MAX_AGE_MS || 10 * 60_000));

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
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "sec_fetch_cross_site", method: req.method, url: req.url, sfs: _sfs, reqId: req.id }));
  }
  const t0 = process.hrtime.bigint();
  res.on("prefinish", () => { const _ms = (Number(process.hrtime.bigint()-t0)/1e6).toFixed(2); res.setHeader("X-Response-Time", `${_ms}ms`); res.setHeader("Server-Timing", `total;dur=${_ms}`); });
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


const state = {
  lastRun: null,
  results: [],
  errors: []
};

let rpcTargets = [];
let policy = null;
let dockerClient = null;

const GOVERNOR_ABI = [
  "function executor() view returns (address)",
  "function proposals(uint256) view returns (address target,uint256 value,bytes data,uint256 forVotes,uint256 againstVotes,uint256 start,uint256 end,bool queued,bool executed)"
];
const EXECUTOR_ABI = [
  "function delay() view returns (uint256)",
  "function queueLength() view returns (uint256)",
  "function queue(uint256) view returns (address target,uint256 value,bytes data,uint256 eta,bool executed)"
];
const EVIDENCE_ANCHOR_ABI = [
  "function anchorAt(uint256) view returns (tuple(bytes32 kind,bytes32 hash,string uri,uint64 anchoredAt,address anchoredBy))"
];
const PAUSE_GUARDIAN_ABI = ["function paused() view returns (bool)"];

const DEFAULT_POLICY = {
  version: 1,
  approvals: {
    threshold: 2,
    signers: []
  },
  preconditions: {
    requireTelemetry: true,
    denyIncidents: ["reorg_risk", "rpc_error", "portal_lag", "finalized_lag"],
    requireNoSyncing: true
  },
  postconditions: {
    requireTelemetryAfter: true
  },
  rollback: {
    enabled: false,
    steps: []
  },
  actions: {
    op_gate_mode: {
      enabled: true,
      allowedModes: ["allow", "pause", "delay", "block"],
      maxDelaySeconds: 120,
      targets: ["l2", "l3"]
    },
    restart_service: {
      enabled: false,
      allowedContainers: [],
      cooldownSeconds: 300
    }
  }
};

const logEvent = (level, event, data) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(data || {})
  };
  console.log(JSON.stringify(payload));
};

const mergePolicy = (base, next) => {
  if (!next || typeof next !== "object") return base;
  const mergedActions = { ...(base.actions || {}) };
  if (next.actions && typeof next.actions === "object") {
    for (const [key, value] of Object.entries(next.actions)) {
      mergedActions[key] = { ...(base.actions?.[key] || {}), ...(value || {}) };
    }
  }
  return {
    ...base,
    ...next,
    approvals: { ...base.approvals, ...(next.approvals || {}) },
    preconditions: { ...base.preconditions, ...(next.preconditions || {}) },
    postconditions: { ...base.postconditions, ...(next.postconditions || {}) },
    rollback: { ...base.rollback, ...(next.rollback || {}) },
    actions: mergedActions
  };
};

const loadPolicy = async () => {
  try {
    const raw = await fs.readFile(POLICY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    policy = mergePolicy(DEFAULT_POLICY, parsed);
    return;
  } catch (err) {
    policy = DEFAULT_POLICY;
  }
};

const savePolicy = async (nextPolicy) => {
  policy = mergePolicy(DEFAULT_POLICY, nextPolicy);
  await fs.mkdir(path.dirname(POLICY_PATH), { recursive: true });
  await fs.writeFile(POLICY_PATH, JSON.stringify(policy, null, 2), "utf8");
  return policy;
};

const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const planPayload = (plan) => {
  const { planHash, approvals, signatureMessage, approvalsRequired, ...rest } = plan || {};
  return rest;
};

const computePlanHash = (plan) =>
  ghost.keccak256(ghost.toUtf8Bytes(stableStringify(planPayload(plan))));

const approvalMessage = (planHash) => `GhostChain ActionPlan ${planHash}`;

const parseSigners = (value) =>
  String(value || "")
    .split(",")
    .map((addr) => addr.trim().toLowerCase())
    .filter(Boolean);

const resolvedApprovalPolicy = () => {
  const envSigners = parseSigners(process.env.ACTION_APPROVER_ADDRESSES || process.env.APPROVAL_SIGNERS);
  const envThresholdRaw = process.env.ACTION_APPROVAL_THRESHOLD || process.env.APPROVAL_THRESHOLD;
  const envThreshold = envThresholdRaw ? Number(envThresholdRaw) : null;
  const base = policy?.approvals || DEFAULT_POLICY.approvals;
  return {
    threshold: Number.isFinite(envThreshold) ? envThreshold : Number(base.threshold || 0),
    signers: envSigners.length ? envSigners : (base.signers || []).map((s) => String(s).toLowerCase())
  };
};

const verifyApprovals = (plan) => {
  const { threshold, signers } = resolvedApprovalPolicy();
  if (!threshold || threshold <= 0) {
    throw new Error("approval_threshold_not_configured");
  }
  if (!signers.length) {
    throw new Error("approval_signers_not_configured");
  }
  const approvals = Array.isArray(plan.approvals) ? plan.approvals : [];
  const seen = new Set();
  const message = approvalMessage(plan.planHash);

  for (const approval of approvals) {
    const signature = approval?.signature || approval?.sig;
    if (!signature) continue;
    let recovered = null;
    try {
      recovered = ghost.verifyMessage(message, signature).toLowerCase();
    } catch {
      continue;
    }
    if (!signers.includes(recovered)) continue;
    if (approval?.signer && String(approval.signer).toLowerCase() !== recovered) continue;
    seen.add(recovered);
  }
  if (seen.size < threshold) {
    throw new Error("insufficient_multisig_approvals");
  }
  return { threshold, approved: Array.from(seen) };
};

async function fetchRegistry() {
  const now = Date.now();
  if (registryCache.data && registryCache.expiresAt > now) return registryCache.data;
  let lastErr;
  for (let attempt = 0; attempt <= registryRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), registryTimeoutMs);
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
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("registry_unavailable");
}

function pickRpc(chain) {
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
}

async function resolveRpc(layer, override) {
  const registry = await fetchRegistry();
  const chain = registry.chains.find((entry) => entry.layer === layer);
  const allowed = new Set([
    ...(typeof chain?.rpc === "string" && chain.rpc ? [chain.rpc] : []),
    ...(Array.isArray(chain?.rpcUrls) ? chain.rpcUrls : []),
    ...(Array.isArray(chain?.endpoints) ? chain.endpoints.map((endpoint) => endpoint.url) : [])
  ]);
  if (override) {
    if (!allowed.has(override)) throw new Error("rpc_override_not_in_registry");
    return override;
  }
  const rpc = pickRpc(chain);
  if (!rpc) throw new Error(`rpc_missing_${layer.toLowerCase()}`);
  return rpc;
}

async function fetchJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data;
}

function checkPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const onResult = (ok, error) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("error", (err) => onResult(false, err.message));
    socket.once("timeout", () => onResult(false, "timeout"));
    socket.connect(port, host, () => onResult(true));
  });
}

async function probe() {
  const results = [];
  const errors = [];
  for (const t of rpcTargets) {
    try {
      const data = await fetchJson(t.url, { jsonrpc: "2.0", id: 1, method: "ghost_chainId", params: [] });
      results.push({ target: t.name, type: "rpc", ok: true, detail: data.result });
    } catch (e) {
      errors.push({ target: t.name, type: "rpc", error: e.message, url: t.url });
      results.push({ target: t.name, type: "rpc", ok: false, error: e.message });
    }
  }

  for (const p of PORTS) {
    const r = await checkPort(MONITOR_HOST, p);
    results.push({ target: `${MONITOR_HOST}:${p}`, type: "port", ...r });
    if (!r.ok) errors.push({ target: `${MONITOR_HOST}:${p}`, type: "port", error: r.error });
  }

  for (const h of HEALTH_ENDPOINTS) {
    try {
      const res = await fetch(h);
      const ok = res.ok;
      const body = await res.text();
      results.push({ target: h, type: "health", ok, status: res.status, body: body.slice(0, 200) });
      if (!ok) errors.push({ target: h, type: "health", error: `HTTP ${res.status}` });
    } catch (e) {
      results.push({ target: h, type: "health", ok: false, error: e.message });
      errors.push({ target: h, type: "health", error: e.message });
    }
  }

  state.lastRun = Date.now();
  state.results = results;
  state.errors = errors;
}

function summarize() {
  const failed = state.results.filter((r) => r.ok === false);
  const suggestions = [];
  if (failed.some((r) => r.type === "rpc")) suggestions.push("Check RPC endpoints, restart op-node/op-geth if unresponsive.");
  if (failed.some((r) => r.type === "port")) suggestions.push("Port unreachable; check docker-proxy or host firewall.");
  if (failed.some((r) => r.type === "health")) suggestions.push("Service health failing; inspect container logs.");
  if (suggestions.length === 0) suggestions.push("All monitored checks are OK.");
  return { failed, suggestions };
}

const requireToken = (req, res) => {
  if (!EXECUTION_TOKEN) {
    res.status(500).json({ ok: false, error: "execution token not configured" });
    return false;
  }
  if (req.header("x-execution-token") !== EXECUTION_TOKEN) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return false;
  }
  return true;
};

const fetchTelemetry = async () => {
  if (!CONSENSUS_TELEMETRY_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(CONSENSUS_TELEMETRY_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`telemetry_http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

const evaluateTelemetry = (telemetry) => {
  const policyPre = policy?.preconditions || DEFAULT_POLICY.preconditions;
  if (!telemetry || !telemetry.ok) {
    if (policyPre.requireTelemetry || REQUIRE_TELEMETRY) {
      return { ok: false, reason: "telemetry_unavailable" };
    }
    return { ok: true, warnings: ["telemetry_unavailable"] };
  }
  const incidents = telemetry.incidents || {};
  const denyIncidents = policyPre.denyIncidents || [];
  const blocking = [];
  for (const layer of Object.keys(incidents)) {
    for (const type of denyIncidents) {
      if (incidents[layer]?.[type]) blocking.push(`${layer}:${type}`);
    }
    if ((policyPre.requireNoSyncing || REQUIRE_TELEMETRY) && telemetry.layers?.[layer]?.syncing) {
      blocking.push(`${layer}:syncing`);
    }
  }
  if (blocking.length) {
    return { ok: false, reason: "telemetry_blocking_incidents", blocking };
  }
  return { ok: true };
};

const ensureDocker = () => {
  if (!dockerClient) {
    dockerClient = new Docker({ socketPath: DOCKER_SOCKET_PATH });
  }
  return dockerClient;
};

const executeRestart = async (action) => {
  if (!DOCKER_ACTIONS_ENABLED) throw new Error("docker_actions_disabled");
  const restartPolicy = policy?.actions?.restart_service || DEFAULT_POLICY.actions.restart_service;
  if (!restartPolicy.enabled) throw new Error("restart_action_disabled");
  const containerName = String(action.container || action.target || "").trim();
  if (!containerName) throw new Error("missing_container_name");
  const allowlist = (restartPolicy.allowedContainers || []).map((n) => n.toLowerCase());
  if (!allowlist.includes(containerName.toLowerCase())) {
    throw new Error("container_not_allowed");
  }
  const docker = ensureDocker();
  const container = docker.getContainer(containerName);
  await container.restart();
  return { ok: true, container: containerName };
};

const executeGateMode = async (action) => {
  const modePolicy = policy?.actions?.op_gate_mode || DEFAULT_POLICY.actions.op_gate_mode;
  if (!modePolicy.enabled) throw new Error("op_gate_mode_disabled");
  const mode = String(action.mode || "").toLowerCase();
  if (!modePolicy.allowedModes.includes(mode)) throw new Error("mode_not_allowed");
  const delaySeconds = Number(action.delaySeconds || 0);
  if (delaySeconds > modePolicy.maxDelaySeconds) throw new Error("delay_exceeds_policy");
  const target = String(action.target || "l2").toLowerCase();
  if (!modePolicy.targets.includes(target)) throw new Error("target_not_allowed");

  const gateUrl = target === "l3" && OP_GATE_URL_L3 ? OP_GATE_URL_L3 : OP_GATE_URL;
  if (!gateUrl) throw new Error("op_gate_url_not_configured");
  if (!OP_GATE_ADMIN_TOKEN) throw new Error("op_gate_admin_token_missing");

  const res = await fetch(`${gateUrl.replace(/\/$/, "")}/gate/mode`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": OP_GATE_ADMIN_TOKEN
    },
    body: JSON.stringify({ mode, delaySeconds })
  });
  if (!res.ok) throw new Error(`op_gate_http_${res.status}`);
  const body = await res.json();
  if (!body?.ok) throw new Error(body?.error || "op_gate_error");
  return { ok: true, target, mode, delaySeconds };
};

const supportedActions = {
  op_gate_mode: executeGateMode,
  restart_service: executeRestart
};

const resolveRequestedActions = (body = {}) => {
  if (Array.isArray(body.actions) && body.actions.length) return body.actions;
  if (Array.isArray(body.targets) && body.targets.length) {
    return body.targets.map((target) => ({ type: "restart_service", container: target }));
  }
  return [];
};

const validateActions = (actions = []) => {
  if (!Array.isArray(actions) || !actions.length) throw new Error("actions_required");
  return actions.map((action) => {
    const type = String(action.type || action.action || "").trim();
    if (!type) throw new Error("action_type_missing");
    if (!supportedActions[type]) throw new Error(`unsupported_action:${type}`);
    return { ...action, type };
  });
};

const buildPlan = async (req) => {
  const actions = validateActions(resolveRequestedActions(req.body));
  const now = Date.now();
  const createdAt = req.body?.createdAt || new Date(now).toISOString();
  const expiresAt = new Date(now + PLAN_TTL_MS).toISOString();
  const dryRunAt = now;

  const governance = {
    governor: GOVERNOR_ADDRESS || null,
    evidenceAnchor: EVIDENCE_ANCHOR_ADDRESS || null,
    anchorIndex: req.body?.governance?.anchorIndex ?? null,
    minDelaySeconds: null
  };

  if (GOVERNANCE_RPC && GOVERNOR_ADDRESS) {
    try {
      const provider = new ghost.JsonRpcProvider(GOVERNANCE_RPC);
      const governor = new ghost.Contract(GOVERNOR_ADDRESS, GOVERNOR_ABI, provider);
      const executorAddr = await governor.executor();
      const executor = new ghost.Contract(executorAddr, EXECUTOR_ABI, provider);
      const delay = await executor.delay();
      governance.executor = executorAddr;
      governance.minDelaySeconds = Number(delay);
    } catch {
      governance.executor = null;
      governance.minDelaySeconds = null;
    }
  }

  const plan = {
    version: 1,
    planId: req.body?.planId || crypto.randomUUID(),
    createdAt,
    expiresAt,
    dryRun: true,
    dryRunAt,
    policyVersion: policy?.version || DEFAULT_POLICY.version,
    actions,
    governance,
    notes: req.body?.notes || ""
  };

  plan.planHash = computePlanHash(plan);
  plan.signatureMessage = approvalMessage(plan.planHash);
  plan.approvalsRequired = resolvedApprovalPolicy();

  return plan;
};

const checkKillSwitches = async () => {
  if (AUTONOMY_KILL_SWITCH) throw new Error("autonomy_kill_switch_enabled");
  if (!PAUSE_GUARDIAN_ADDRESS) {
    if (REQUIRE_PAUSE_GUARDIAN) throw new Error("pause_guardian_not_configured");
    return { paused: null };
  }
  const provider = new ghost.JsonRpcProvider(GOVERNANCE_RPC || process.env.RPC_L1);
  const guardian = new ghost.Contract(PAUSE_GUARDIAN_ADDRESS, PAUSE_GUARDIAN_ABI, provider);
  const paused = await guardian.paused();
  if (paused) throw new Error("pause_guardian_paused");
  return { paused };
};

const verifyGovernanceAnchor = async (plan) => {
  if (!REQUIRE_GOVERNANCE) return { ok: true, skipped: true };
  if (!GOVERNANCE_RPC || !GOVERNOR_ADDRESS) throw new Error("governance_rpc_or_governor_missing");
  if (!EVIDENCE_ANCHOR_ADDRESS && !plan.governance?.evidenceAnchor) {
    throw new Error("evidence_anchor_missing");
  }
  if (plan.governance?.governor && plan.governance.governor.toLowerCase() !== GOVERNOR_ADDRESS.toLowerCase()) {
    throw new Error("governor_mismatch");
  }
  if (
    EVIDENCE_ANCHOR_ADDRESS &&
    plan.governance?.evidenceAnchor &&
    plan.governance.evidenceAnchor.toLowerCase() !== EVIDENCE_ANCHOR_ADDRESS.toLowerCase()
  ) {
    throw new Error("evidence_anchor_mismatch");
  }
  const anchorIndex = plan.governance?.anchorIndex;
  if (anchorIndex === null || anchorIndex === undefined) {
    throw new Error("anchor_index_missing");
  }

  const provider = new ghost.JsonRpcProvider(GOVERNANCE_RPC);
  const governor = new ghost.Contract(GOVERNOR_ADDRESS, GOVERNOR_ABI, provider);
  const executorAddr = await governor.executor();
  const executorAddrLower = String(executorAddr).toLowerCase();
  const executor = new ghost.Contract(executorAddr, EXECUTOR_ABI, provider);
  const delaySeconds = Number(await executor.delay());

  const anchorAddr = plan.governance?.evidenceAnchor || EVIDENCE_ANCHOR_ADDRESS;
  const anchor = new ghost.Contract(anchorAddr, EVIDENCE_ANCHOR_ABI, provider);
  const record = await anchor.anchorAt(anchorIndex);
  const recordHash = record.hash || record[1];
  const anchoredBy = String(record.anchoredBy || record[4] || "").toLowerCase();
  const anchoredAt = Number(record.anchoredAt || record[3] || 0);

  if (String(recordHash).toLowerCase() !== plan.planHash.toLowerCase()) {
    throw new Error("anchor_hash_mismatch");
  }
  if (anchoredBy !== executorAddrLower) {
    throw new Error("anchor_not_from_executor");
  }

  const createdAt = Date.parse(plan.createdAt);
  if (!Number.isFinite(createdAt)) throw new Error("plan_createdAt_invalid");
  const minDelay = Math.max(delaySeconds, Number(plan.governance?.minDelaySeconds || 0));
  if (Date.now() < createdAt + minDelay * 1000) {
    throw new Error("timelock_delay_not_elapsed");
  }
  if (anchoredAt && createdAt > anchoredAt * 1000) {
    throw new Error("plan_created_after_anchor");
  }
  return { ok: true, executor: executorAddr, delaySeconds, anchoredAt };
};

const ensureDryRunFresh = (plan) => {
  if (!plan.dryRunAt) throw new Error("dry_run_timestamp_missing");
  if (Date.now() - Number(plan.dryRunAt) > DRY_RUN_MAX_AGE_MS) {
    throw new Error("dry_run_expired");
  }
};

const ensurePlanValid = (plan) => {
  if (!plan || typeof plan !== "object") throw new Error("plan_missing");
  const computed = computePlanHash(plan);
  if (!plan.planHash || plan.planHash.toLowerCase() !== computed.toLowerCase()) {
    throw new Error("plan_hash_mismatch");
  }
  if (plan.expiresAt) {
    const expiresAt = Date.parse(plan.expiresAt);
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) throw new Error("plan_expired");
  }
};

const writeEvidence = async (payload) => {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  const filename = `action-${payload.planHash}-${Date.now()}.json`;
  const filePath = path.join(EVIDENCE_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  await fs.appendFile(path.join(EVIDENCE_DIR, "actions.jsonl"), JSON.stringify(payload) + "\n", "utf8");
  return filePath;
};

app.get("/health", (_req, res) => {
  res.json({
    ok: state.errors.length === 0,
    lastRun: state.lastRun,
    errors: state.errors.slice(0, 20),
    autonomy: {
      enabled: AUTONOMY_EXECUTION_ENABLED,
      killSwitch: AUTONOMY_KILL_SWITCH
    }
  });
});

app.get("/status", (_req, res) => {
  res.json({ ok: state.errors.length === 0, lastRun: state.lastRun, results: state.results, summary: summarize() });
});

app.get("/policy", (_req, res) => {
  res.json({ ok: true, policy });
});

app.post("/policy", async (req, res) => {
  if (!requireToken(req, res)) return;
  try {
    const saved = await savePolicy(req.body || {});
    res.json({ ok: true, policy: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.post("/remediate/dry-run", async (req, res) => {
  try {
    const plan = await buildPlan(req);
    await probe();
    const telemetry = await fetchTelemetry().catch((err) => ({ ok: false, error: err.message }));
    const telemetryCheck = evaluateTelemetry(telemetry);
    const warnings = [];
    if (REQUIRE_GOVERNANCE && (!plan.governance?.executor || !plan.governance?.minDelaySeconds)) {
      warnings.push("governance_context_unavailable");
    }
    if (REQUIRE_PAUSE_GUARDIAN && !PAUSE_GUARDIAN_ADDRESS) {
      warnings.push("pause_guardian_not_configured");
    }
    res.json({
      ok: telemetryCheck.ok,
      plan,
      telemetry: telemetryCheck,
      summary: summarize(),
      warnings
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

app.post("/remediate/execute", async (req, res) => {
  if (!requireToken(req, res)) return;
  if (PROD_LOCK_ACTIVE) {
    res.status(403).json({ ok: false, error: "prod_lock_enabled" });
    return;
  }
  if (!AUTONOMY_EXECUTION_ENABLED) {
    res.status(403).json({ ok: false, error: "autonomy_execution_disabled" });
    return;
  }

  const plan = req.body?.plan || req.body;
  try {
    ensurePlanValid(plan);
    ensureDryRunFresh(plan);
    await checkKillSwitches();
    verifyApprovals(plan);

    const telemetry = await fetchTelemetry().catch((err) => ({ ok: false, error: err.message }));
    const telemetryCheck = evaluateTelemetry(telemetry);
    if (!telemetryCheck.ok) {
      throw new Error(telemetryCheck.reason || "telemetry_blocked");
    }

    const governance = await verifyGovernanceAnchor(plan);

    const preSnapshot = { lastRun: state.lastRun, results: state.results, errors: state.errors };
    const actions = validateActions(plan.actions);
    const results = [];

    for (const action of actions) {
      const handler = supportedActions[action.type];
      const startedAt = Date.now();
      try {
        const result = await handler(action);
        results.push({ action: action.type, ok: true, result, durationMs: Date.now() - startedAt });
      } catch (err) {
        results.push({ action: action.type, ok: false, error: err?.message || String(err), durationMs: Date.now() - startedAt });
        throw err;
      }
    }

    await probe();
    const postSnapshot = { lastRun: state.lastRun, results: state.results, errors: state.errors };
    const postTelemetry = await fetchTelemetry().catch((err) => ({ ok: false, error: err.message }));
    const postTelemetryCheck = evaluateTelemetry(postTelemetry);

    const evidence = {
      planHash: plan.planHash,
      plan,
      approvals: plan.approvals || [],
      executedAt: new Date().toISOString(),
      governance,
      telemetry: telemetryCheck,
      postconditions: {
        ok: postTelemetryCheck.ok,
        detail: postTelemetryCheck
      },
      preSnapshot,
      postSnapshot,
      results
    };
    evidence.executionHash = ghost.keccak256(ghost.toUtf8Bytes(stableStringify(evidence)));
    const evidencePath = await writeEvidence(evidence);

    const requirePost = policy?.postconditions?.requireTelemetryAfter ?? DEFAULT_POLICY.postconditions.requireTelemetryAfter;
    const ok = requirePost ? postTelemetryCheck.ok : true;
    res.json({ ok, results, evidencePath, executionHash: evidence.executionHash, postconditions: evidence.postconditions });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

/** GET /stats — autonomy config and last-run state summary */
app.get("/stats", (_req, res) => {
  res.json({
    ok: true,
    stats: {
      autonomyEnabled: AUTONOMY_EXECUTION_ENABLED,
      killSwitch: AUTONOMY_KILL_SWITCH,
      prodLock: PROD_LOCK_ACTIVE,
      requireGovernance: REQUIRE_GOVERNANCE,
      lastRun: state.lastRun,
      errors: state.errors.length,
      rpcTargets: rpcTargets.map((r) => r.name),
      fetchedAt: new Date().toISOString()
    }
  });
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

async function init() {
  try {
    await loadPolicy();
    const [l1, l2, l3] = await Promise.all([
      resolveRpc("L1", process.env.MONITOR_RPC_L1),
      resolveRpc("L2", process.env.MONITOR_RPC_L2),
      resolveRpc("L3", process.env.MONITOR_RPC_L3)
    ]);
    rpcTargets = [
      { name: "l1", url: l1 },
      { name: "l2", url: l2 },
      { name: "l3", url: l3 }
    ];
    const intervalMs = Number(process.env.MONITOR_INTERVAL_MS || "10000");
    setInterval(probe, intervalMs);
    probe().catch(() => {});
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`[netmgr] listening on :${PORT}`);
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
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown", port: PORT, pid: process.pid, boot_ms: Number((process.hrtime.bigint() - _startedAt) / 1_000_000n) }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGUSR2", () => {
  const m = process.memoryUsage(); const cu = process.cpuUsage();
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sigusr2_diag", pid: process.pid, rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, cpuUser: cu.user, cpuSystem: cu.system, reqTotal: _reqTotal, uptime: process.uptime() }));
});
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
process.on("SIGHUP", () => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sighup_reload", pid: process.pid })); });
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
  } catch (err) {
    console.error(`[netmgr] registry error: ${err?.message || err}`);
    process.exit(1);
  }
}

init();
