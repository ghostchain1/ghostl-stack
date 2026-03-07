import express from "express";
import { ghost } from "ghost";
import promClient from "prom-client";
import { promises as fs } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 7635);
const METRICS_PATH = process.env.METRICS_PATH || "/metrics";
const METRICS_ENABLED = process.env.METRICS_ENABLED !== "false";
const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.POLL_INTERVAL_MS || 10000));
const READY_MAX_STALE_MS = Math.max(POLL_INTERVAL_MS * 3, Number(process.env.READY_MAX_STALE_MS || 60000));

const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";
const ALERT_WEBHOOK_TIMEOUT_MS = Number(process.env.ALERT_WEBHOOK_TIMEOUT_MS || 3000);
const ALERT_WEBHOOK_RETRIES = Math.max(0, Number(process.env.ALERT_WEBHOOK_RETRIES || 1));
const ALERT_WEBHOOK_COOLDOWN_MS = Math.max(1000, Number(process.env.ALERT_WEBHOOK_COOLDOWN_MS || 60000));

const LAYERS = ["L1", "L2", "L3"];
const RPC_OVERRIDES = {
  L1: process.env.RPC_L1 || "",
  L2: process.env.RPC_L2 || "",
  L3: process.env.RPC_L3 || ""
};
const OP_NODE_RPC = {
  L2: process.env.OP_NODE_L2_RPC || process.env.OP_NODE_RPC_L2 || process.env.OP_NODE_RPC || "",
  L3: process.env.OP_NODE_L3_RPC || process.env.OP_NODE_RPC_L3 || process.env.OP_NODE_RPC || ""
};

const STALL_THRESHOLD_SEC = {
  L1: Number(process.env.STALL_THRESHOLD_SEC_L1 || process.env.STALL_THRESHOLD_SEC || 60),
  L2: Number(process.env.STALL_THRESHOLD_SEC_L2 || process.env.STALL_THRESHOLD_SEC || 45),
  L3: Number(process.env.STALL_THRESHOLD_SEC_L3 || process.env.STALL_THRESHOLD_SEC || 45)
};
const PEER_MIN = {
  L1: Number(process.env.PEER_MIN_L1 || 1),
  L2: Number(process.env.PEER_MIN_L2 || 1),
  L3: Number(process.env.PEER_MIN_L3 || 1)
};
const OP_SAFE_LAG_BLOCKS = Number(process.env.OP_SAFE_LAG_BLOCKS || 120);
const OP_FINALIZED_LAG_BLOCKS = Number(process.env.OP_FINALIZED_LAG_BLOCKS || 240);
const OP_L1_LAG_BLOCKS = Number(process.env.OP_L1_LAG_BLOCKS || 20);

const FINALITY_ENABLED = process.env.FINALITY_ENABLED !== "false";
const DRAFT_PROPOSALS_ENABLED = process.env.DRAFT_PROPOSALS_ENABLED !== "false";
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || "/data/evidence";
const PROPOSAL_DIR = process.env.PROPOSAL_DIR || "/data/proposals";
const FINALITY_STATE_PATH = process.env.FINALITY_STATE_PATH || "/data/finality-state.json";

const L2_OUTPUT_ORACLE_ADDRESS =
  process.env.L2_OUTPUT_ORACLE_ADDRESS ||
  process.env.L2OO_ADDRESS ||
  process.env.L2_OUTPUT_ORACLE_PROXY ||
  "";
const L3_OUTPUT_ORACLE_ADDRESS =
  process.env.L3_OUTPUT_ORACLE_ADDRESS ||
  process.env.L3_L2OO_ADDRESS ||
  process.env.L3_OUTPUT_ORACLE_PROXY ||
  "";
const L2_OUTPUT_ORACLE_RPC = process.env.L2_OUTPUT_ORACLE_RPC || RPC_OVERRIDES.L1 || "";
const L3_OUTPUT_ORACLE_RPC = process.env.L3_OUTPUT_ORACLE_RPC || RPC_OVERRIDES.L2 || "";

const ORACLE_MAX_BLOCK_DRIFT_L2 = Number(process.env.ORACLE_MAX_BLOCK_DRIFT_L2 || 500);
const ORACLE_MAX_BLOCK_DRIFT_L3 = Number(process.env.ORACLE_MAX_BLOCK_DRIFT_L3 || 500);
const ORACLE_MAX_AGE_SEC_L2 = Number(process.env.ORACLE_MAX_AGE_SEC_L2 || 600);
const ORACLE_MAX_AGE_SEC_L3 = Number(process.env.ORACLE_MAX_AGE_SEC_L3 || 600);
const ORACLE_FUTURE_GRACE_SEC = Number(process.env.ORACLE_FUTURE_GRACE_SEC || 30);

const BRIDGE_WATCH_ENABLED = process.env.BRIDGE_WATCH_ENABLED !== "false";
const BRIDGE_CONFIRMATIONS = Math.max(0, Number(process.env.BRIDGE_CONFIRMATIONS || 2));
const BRIDGE_EVENT_WINDOW_BLOCKS = Math.max(100, Number(process.env.BRIDGE_EVENT_WINDOW_BLOCKS || 5000));
const BRIDGE_STALE_SEC = Math.max(60, Number(process.env.BRIDGE_STALE_SEC || 1800));
const BRIDGE_L2L3_ADDRESS = process.env.BRIDGE_L2L3_ADDRESS || process.env.BRIDGE_ADDRESS || "";

const GOVERNOR_ADDRESS_L1 =
  process.env.GOVERNOR_ADDRESS_L1 ||
  process.env.GOVERNOR_ADDRESS ||
  process.env.GOVERNANCE_CONTRACT_ADDRESS ||
  "";
const PAUSE_GUARDIAN_ADDRESS = process.env.PAUSE_GUARDIAN_ADDRESS || process.env.FUT_PAUSE_GUARDIAN || "";

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


const registry = new promClient.Registry();
if (METRICS_ENABLED) {
  promClient.collectDefaultMetrics({ register: registry });
}

const metricsPrefix = "ghost_consensus";
const layerUpGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_up`,
  help: "1 if latest poll for the layer succeeded",
  labelNames: ["layer"],
  registers: [registry]
});
const headBlockGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_head_block`,
  help: "latest observed head block number",
  labelNames: ["layer"],
  registers: [registry]
});
const headAgeGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_head_age_seconds`,
  help: "age of the latest head block",
  labelNames: ["layer"],
  registers: [registry]
});
const blockTimeGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_block_time_seconds`,
  help: "estimated block time for the latest block",
  labelNames: ["layer"],
  registers: [registry]
});
const peerGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_peer_count`,
  help: "peer count reported by net_peerCount",
  labelNames: ["layer"],
  registers: [registry]
});
const txpoolGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_txpool`,
  help: "txpool status by state",
  labelNames: ["layer", "state"],
  registers: [registry]
});
const safeBlockGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_safe_block`,
  help: "safe block number if supported",
  labelNames: ["layer"],
  registers: [registry]
});
const finalizedBlockGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_finalized_block`,
  help: "finalized block number if supported",
  labelNames: ["layer"],
  registers: [registry]
});
const syncingGauge = new promClient.Gauge({
  name: `${metricsPrefix}_layer_syncing`,
  help: "1 if ghost_syncing returns a payload",
  labelNames: ["layer"],
  registers: [registry]
});
const opLagGauge = new promClient.Gauge({
  name: `${metricsPrefix}_op_lag_blocks`,
  help: "OP Stack lag metrics",
  labelNames: ["layer", "type"],
  registers: [registry]
});
const outputOracleBlockGauge = new promClient.Gauge({
  name: `${metricsPrefix}_output_oracle_latest_block`,
  help: "latest L2 output oracle block number",
  labelNames: ["layer"],
  registers: [registry]
});
const outputOracleIndexGauge = new promClient.Gauge({
  name: `${metricsPrefix}_output_oracle_latest_index`,
  help: "latest L2 output oracle index",
  labelNames: ["layer"],
  registers: [registry]
});
const outputOracleAgeGauge = new promClient.Gauge({
  name: `${metricsPrefix}_output_oracle_age_seconds`,
  help: "age of latest L2 output oracle timestamp",
  labelNames: ["layer"],
  registers: [registry]
});
const bridgePendingGauge = new promClient.Gauge({
  name: `${metricsPrefix}_bridge_pending`,
  help: "pending bridge deposits by type",
  labelNames: ["type"],
  registers: [registry]
});
const bridgeOldestAgeGauge = new promClient.Gauge({
  name: `${metricsPrefix}_bridge_oldest_pending_age_seconds`,
  help: "age of the oldest pending bridge deposit",
  registers: [registry]
});
const bridgeLastScannedGauge = new promClient.Gauge({
  name: `${metricsPrefix}_bridge_last_scanned_block`,
  help: "last block scanned for bridge events",
  labelNames: ["layer"],
  registers: [registry]
});
const incidentGauge = new promClient.Gauge({
  name: `${metricsPrefix}_incident`,
  help: "incident flags by layer/type",
  labelNames: ["layer", "type"],
  registers: [registry]
});
const alertsCounter = new promClient.Counter({
  name: `${metricsPrefix}_alerts_total`,
  help: "total incident state transitions",
  labelNames: ["layer", "type", "action"],
  registers: [registry]
});
const pollDuration = new promClient.Histogram({
  name: `${metricsPrefix}_poll_duration_seconds`,
  help: "duration of telemetry polls",
  registers: [registry]
});

const providerCache = new Map();
const state = {
  ready: false,
  lastPollAt: 0,
  layers: {},
  incidents: {},
  op: {},
  finality: {},
  bridge: null,
  lastError: null
};
const previousHeads = {};
const incidentState = {};
const alertThrottle = new Map();
let pollInFlight = false;

const bridgeState = {
  lastProcessedBlock: 0,
  pendingDeposits: {},
  pendingErc20Deposits: {}
};
const blockTimestampCache = new Map();

const logEvent = (level, event, data) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(data || {})
  };
  console.log(JSON.stringify(payload));
};

const ensureDir = async (dir) => {
  if (!dir) return;
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    logEvent("warn", "ensure_dir_failed", { dir, error: err?.message || String(err) });
  }
};

const readJsonFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
};

const writeJsonFile = async (filePath, data) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    logEvent("warn", "write_json_failed", { filePath, error: err?.message || String(err) });
  }
};

const initFinalityState = async () => {
  await ensureDir(EVIDENCE_DIR);
  await ensureDir(PROPOSAL_DIR);
  if (!FINALITY_STATE_PATH) return;
  const stored = await readJsonFile(FINALITY_STATE_PATH);
  if (!stored) return;
  const bridgeStored = stored.bridge || stored;
  if (bridgeStored && typeof bridgeStored === "object") {
    bridgeState.lastProcessedBlock = Number(bridgeStored.lastProcessedBlock || 0);
    bridgeState.pendingDeposits = bridgeStored.pendingDeposits || {};
    bridgeState.pendingErc20Deposits = bridgeStored.pendingErc20Deposits || {};
  }
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      const parsed = Number.parseInt(value, 16);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseTimestamp = (value) => {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return parsed > 1e12 ? Math.floor(parsed / 1000) : parsed;
};

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const L2_OUTPUT_ORACLE_ABI = [
  "function latestOutputIndex() view returns (uint256)",
  "function latestBlockNumber() view returns (uint256)",
  "function nextOutputIndex() view returns (uint256)",
  "function getL2Output(uint256) view returns (tuple(bytes32 outputRoot,uint128 timestamp,uint128 l2BlockNumber))",
  "function finalizationPeriodSeconds() view returns (uint256)"
];
const ORACLE_VERSION_ABI = ["function version() view returns (string)"];

const GOVERNOR_ABI = ["function propose(address target,uint256 value,bytes data) returns (uint256)"];
const PAUSE_GUARDIAN_V1_ABI = ["function setPaused(bool p)"];
const PAUSE_GUARDIAN_V2_ABI = ["function pause()"];

const BRIDGE_ABI = [
  "event DepositInitiated(address indexed from,address indexed to,uint256 amount,uint256 nonce)",
  "event Finalized(address indexed from,address indexed to,uint256 amount,uint256 nonce)",
  "event ERC20DepositInitiated(address indexed token,address indexed from,address indexed to,uint256 amount,uint256 nonce)",
  "event ERC20Finalized(address indexed token,address indexed from,address indexed to,uint256 amount,uint256 nonce)",
  "event ERC20WithdrawReleased(address indexed token,address indexed from,address indexed to,uint256 amount,uint256 nonce)"
];
const bridgeIface = new ghost.Interface(BRIDGE_ABI);

const getProvider = (rpc) => {
  if (!providerCache.has(rpc)) {
    providerCache.set(rpc, new ghost.JsonRpcProvider(rpc));
  }
  return providerCache.get(rpc);
};

const fetchOutputOracleSnapshot = async (label, rpc, address, expectedParentChainId = null) => {
  if (!address) return { label, address: "", configured: true, error: "oracle_address_missing" };
  if (!rpc) return { label, address, configured: true, error: "oracle_parent_rpc_missing" };
  let normalizedAddress = "";
  try {
    normalizedAddress = ghost.getAddress(address);
  } catch {
    return { label, address, configured: true, addressInvalid: true, error: "oracle_address_invalid" };
  }
  if (normalizedAddress.toLowerCase() === ghost.ZeroAddress.toLowerCase()) {
    return {
      label,
      address: normalizedAddress,
      configured: true,
      zeroAddress: true,
      error: "oracle_zero_address"
    };
  }

  const provider = getProvider(rpc);
  const contract = new ghost.Contract(normalizedAddress, L2_OUTPUT_ORACLE_ABI, provider);
  const versionContract = new ghost.Contract(normalizedAddress, ORACLE_VERSION_ABI, provider);
  const snapshot = { label, address: normalizedAddress, rpc, configured: true, expectedParentChainId };

  try {
    snapshot.parentChainId = parseNumber(await provider.send("gst_chainId", []));
  } catch (err) {
    snapshot.parentChainIdError = err?.message || String(err);
  }
  if (
    expectedParentChainId !== null &&
    expectedParentChainId !== undefined &&
    snapshot.parentChainId !== null &&
    snapshot.parentChainId !== undefined &&
    snapshot.parentChainId !== expectedParentChainId
  ) {
    snapshot.parentChainMismatch = true;
  }
  try {
    const code = await provider.getCode(normalizedAddress);
    snapshot.hasCode = Boolean(code && code !== "0x");
    if (!snapshot.hasCode) {
      snapshot.contractCodeMissing = true;
      snapshot.error = "oracle_contract_not_deployed";
      return snapshot;
    }
  } catch (err) {
    snapshot.contractCodeError = err?.message || String(err);
  }
  try {
    snapshot.version = String(await versionContract.version());
    if (!snapshot.version) {
      snapshot.versionEmpty = true;
    }
  } catch (err) {
    snapshot.versionError = err?.message || String(err);
  }

  try {
    snapshot.latestOutputIndex = parseNumber(await contract.latestOutputIndex());
  } catch (err) {
    snapshot.latestOutputIndexError = err?.message || String(err);
  }
  try {
    snapshot.nextOutputIndex = parseNumber(await contract.nextOutputIndex());
  } catch (err) {
    snapshot.nextOutputIndexError = err?.message || String(err);
  }
  try {
    snapshot.latestBlockNumber = parseNumber(await contract.latestBlockNumber());
  } catch (err) {
    snapshot.latestBlockNumberError = err?.message || String(err);
  }
  try {
    snapshot.finalizationPeriodSeconds = parseNumber(await contract.finalizationPeriodSeconds());
  } catch (err) {
    snapshot.finalizationPeriodSecondsError = err?.message || String(err);
  }

  if (snapshot.latestOutputIndex !== null && snapshot.latestOutputIndex !== undefined) {
    try {
      const output = await contract.getL2Output(snapshot.latestOutputIndex);
      snapshot.outputRoot = output?.outputRoot ?? output?.[0] ?? null;
      snapshot.outputTimestamp = parseNumber(output?.timestamp ?? output?.[1] ?? null);
      snapshot.outputBlockNumber = parseNumber(output?.l2BlockNumber ?? output?.[2] ?? null);
    } catch (err) {
      snapshot.outputError = err?.message || String(err);
    }
  }
  return snapshot;
};

const computeOracleIncidents = ({
  snapshot,
  headNumber,
  headTimestamp,
  maxBlockDrift,
  maxAgeSec
}) => {
  const incidents = {};
  if (!snapshot || !snapshot.configured) return incidents;
  if (snapshot.addressInvalid) {
    incidents.oracle_address_invalid = true;
  }
  if (snapshot.zeroAddress) {
    incidents.oracle_zero_address = true;
  }
  if (snapshot.parentChainMismatch) {
    incidents.oracle_wrong_parent_chain = true;
  }
  if (snapshot.contractCodeMissing) {
    incidents.oracle_not_deployed = true;
  }
  if (snapshot.versionError) {
    incidents.oracle_abi_mismatch = true;
  }
  if (snapshot.versionEmpty) {
    incidents.oracle_version_empty = true;
  }
  if (snapshot.error || snapshot.latestBlockNumberError || snapshot.latestOutputIndexError) {
    incidents.oracle_error = true;
  }
  if (snapshot.outputError) {
    incidents.oracle_output_missing = true;
  }
  if (snapshot.outputRoot && snapshot.outputRoot.toLowerCase() === ZERO_HASH) {
    incidents.oracle_zero_root = true;
  }
  if (headNumber !== null && snapshot.latestBlockNumber !== null && snapshot.latestBlockNumber !== undefined) {
    const delta = headNumber - snapshot.latestBlockNumber;
    if (delta < 0 && Math.abs(delta) > maxBlockDrift) {
      incidents.oracle_ahead = true;
    }
    if (delta > maxBlockDrift) {
      incidents.oracle_lag = true;
    }
  }
  if (
    headTimestamp !== null &&
    snapshot.outputTimestamp !== null &&
    snapshot.outputTimestamp !== undefined
  ) {
    const age = Math.max(0, headTimestamp - snapshot.outputTimestamp);
    if (age > maxAgeSec) {
      incidents.oracle_stale = true;
    }
    if (snapshot.outputTimestamp - headTimestamp > ORACLE_FUTURE_GRACE_SEC) {
      incidents.oracle_future_timestamp = true;
    }
  }
  if (
    snapshot.latestOutputIndex !== null &&
    snapshot.latestOutputIndex !== undefined &&
    snapshot.nextOutputIndex !== null &&
    snapshot.nextOutputIndex !== undefined
  ) {
    if (snapshot.nextOutputIndex < snapshot.latestOutputIndex) {
      incidents.oracle_index_mismatch = true;
    }
    if (
      snapshot.latestOutputIndex > 0 &&
      snapshot.nextOutputIndex !== snapshot.latestOutputIndex + 1
    ) {
      incidents.oracle_index_mismatch = true;
    }
  }
  if (
    snapshot.outputBlockNumber !== null &&
    snapshot.outputBlockNumber !== undefined &&
    snapshot.latestBlockNumber !== null &&
    snapshot.latestBlockNumber !== undefined &&
    snapshot.outputBlockNumber !== snapshot.latestBlockNumber
  ) {
    incidents.oracle_block_mismatch = true;
  }
  return incidents;
};

const bridgeCoder = ghost.AbiCoder.defaultAbiCoder();

const buildBridgeKey = (fields, values) =>
  ghost.keccak256(bridgeCoder.encode(fields, values.map((v) => (typeof v === "string" ? v : v))));

const getBlockTimestamp = async (provider, blockNumber) => {
  if (blockTimestampCache.has(blockNumber)) return blockTimestampCache.get(blockNumber);
  try {
    const block = await provider.getBlock(blockNumber);
    const ts = parseTimestamp(block?.timestamp ?? null);
    blockTimestampCache.set(blockNumber, ts);
    return ts;
  } catch {
    return null;
  }
};

const applyBridgeEvent = (event, timestamp) => {
  if (!event) return;
  if (event.name === "DepositInitiated") {
    const key = buildBridgeKey(
      ["address", "address", "uint256", "uint256"],
      [event.args.from, event.args.to, event.args.amount, event.args.nonce]
    );
    if (!bridgeState.pendingDeposits[key]) {
      bridgeState.pendingDeposits[key] = { timestamp, blockNumber: event.blockNumber };
    }
    return;
  }
  if (event.name === "Finalized") {
    const key = buildBridgeKey(
      ["address", "address", "uint256", "uint256"],
      [event.args.from, event.args.to, event.args.amount, event.args.nonce]
    );
    if (bridgeState.pendingDeposits[key]) {
      delete bridgeState.pendingDeposits[key];
    } else {
      bridgeState.missingFinalizations ??= [];
      bridgeState.missingFinalizations.push({ key, blockNumber: event.blockNumber, timestamp });
      if (bridgeState.missingFinalizations.length > 100) {
        bridgeState.missingFinalizations.shift();
      }
    }
    return;
  }
  if (event.name === "ERC20DepositInitiated") {
    const key = buildBridgeKey(
      ["address", "address", "address", "uint256", "uint256"],
      [event.args.token, event.args.from, event.args.to, event.args.amount, event.args.nonce]
    );
    if (!bridgeState.pendingErc20Deposits[key]) {
      bridgeState.pendingErc20Deposits[key] = { timestamp, blockNumber: event.blockNumber };
    }
    return;
  }
  if (event.name === "ERC20Finalized") {
    const key = buildBridgeKey(
      ["address", "address", "address", "uint256", "uint256"],
      [event.args.token, event.args.from, event.args.to, event.args.amount, event.args.nonce]
    );
    if (bridgeState.pendingErc20Deposits[key]) {
      delete bridgeState.pendingErc20Deposits[key];
    } else {
      bridgeState.missingFinalizations ??= [];
      bridgeState.missingFinalizations.push({ key, blockNumber: event.blockNumber, timestamp, erc20: true });
      if (bridgeState.missingFinalizations.length > 100) {
        bridgeState.missingFinalizations.shift();
      }
    }
    return;
  }
};

const fetchBridgeStatus = async ({ rpc, headNumber, headTimestamp }) => {
  if (!BRIDGE_WATCH_ENABLED || !BRIDGE_L2L3_ADDRESS) {
    return { configured: false };
  }
  if (!rpc || headNumber === null) {
    return { configured: true, error: "rpc_missing" };
  }
  const provider = getProvider(rpc);
  const toBlock = Math.max(0, headNumber - BRIDGE_CONFIRMATIONS);
  if (toBlock <= 0) return { configured: true, lastProcessedBlock: bridgeState.lastProcessedBlock };

  let fromBlock = bridgeState.lastProcessedBlock ? bridgeState.lastProcessedBlock + 1 : 0;
  if (!bridgeState.lastProcessedBlock) {
    fromBlock = Math.max(0, toBlock - BRIDGE_EVENT_WINDOW_BLOCKS);
  }
  if (fromBlock > toBlock) {
    return {
      configured: true,
      lastProcessedBlock: bridgeState.lastProcessedBlock,
      pendingDeposits: Object.keys(bridgeState.pendingDeposits).length,
      pendingErc20Deposits: Object.keys(bridgeState.pendingErc20Deposits).length
    };
  }

  const topics = [
    [
      bridgeIface.getEvent("DepositInitiated").topicHash,
      bridgeIface.getEvent("Finalized").topicHash,
      bridgeIface.getEvent("ERC20DepositInitiated").topicHash,
      bridgeIface.getEvent("ERC20Finalized").topicHash
    ]
  ];

  let logs = [];
  try {
    logs = await provider.getLogs({
      address: BRIDGE_L2L3_ADDRESS,
      fromBlock,
      toBlock,
      topics
    });
  } catch (err) {
    return { configured: true, error: err?.message || String(err) };
  }

  for (const log of logs) {
    let parsed;
    try {
      parsed = bridgeIface.parseLog(log);
    } catch {
      continue;
    }
    const ts = await getBlockTimestamp(provider, log.blockNumber);
    applyBridgeEvent({ ...parsed, blockNumber: log.blockNumber }, ts ?? headTimestamp ?? null);
  }

  bridgeState.lastProcessedBlock = toBlock;
  await writeJsonFile(FINALITY_STATE_PATH, { bridge: bridgeState });

  const nowSec = headTimestamp ?? Math.floor(Date.now() / 1000);
  let oldest = null;
  for (const entry of Object.values(bridgeState.pendingDeposits)) {
    if (entry?.timestamp && (oldest === null || entry.timestamp < oldest)) oldest = entry.timestamp;
  }
  for (const entry of Object.values(bridgeState.pendingErc20Deposits)) {
    if (entry?.timestamp && (oldest === null || entry.timestamp < oldest)) oldest = entry.timestamp;
  }

  const pendingDeposits = Object.keys(bridgeState.pendingDeposits).length;
  const pendingErc20Deposits = Object.keys(bridgeState.pendingErc20Deposits).length;
  const oldestAge = oldest ? Math.max(0, nowSec - oldest) : null;

  const incidents = {};
  if (bridgeState.missingFinalizations && bridgeState.missingFinalizations.length > 0) {
    incidents.bridge_finalize_without_deposit = true;
  }
  if (oldestAge !== null && oldestAge > BRIDGE_STALE_SEC) {
    incidents.bridge_finalize_stale = true;
  }

  return {
    configured: true,
    lastProcessedBlock: bridgeState.lastProcessedBlock,
    pendingDeposits,
    pendingErc20Deposits,
    oldestPendingAgeSec: oldestAge,
    incidents
  };
};

const buildPauseGuardianActions = () => {
  if (!PAUSE_GUARDIAN_ADDRESS) return [];
  let guardian;
  try {
    guardian = ghost.getAddress(PAUSE_GUARDIAN_ADDRESS);
  } catch {
    return [];
  }
  const actions = [];
  const v1 = new ghost.Interface(PAUSE_GUARDIAN_V1_ABI);
  const v2 = new ghost.Interface(PAUSE_GUARDIAN_V2_ABI);
  actions.push({
    name: "pause_guardian_setPaused",
    target: guardian,
    value: "0",
    data: v1.encodeFunctionData("setPaused", [true]),
    abi: PAUSE_GUARDIAN_V1_ABI
  });
  actions.push({
    name: "pause_guardian_pause",
    target: guardian,
    value: "0",
    data: v2.encodeFunctionData("pause", []),
    abi: PAUSE_GUARDIAN_V2_ABI
  });
  return actions;
};

const buildProposalDraft = ({ layer, type, evidenceHash }) => {
  const actions = buildPauseGuardianActions();
  let governor = null;
  if (GOVERNOR_ADDRESS_L1) {
    try {
      governor = ghost.getAddress(GOVERNOR_ADDRESS_L1);
    } catch {
      governor = null;
    }
  }
  const governorIface = new ghost.Interface(GOVERNOR_ABI);
  const description = `Draft proposal: ${layer} ${type} detected (evidence ${evidenceHash}). Review and execute as appropriate.`;
  const payload = {
    id: `${layer}-${type}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    layer,
    type,
    description,
    governor,
    actions: actions.map((action) => ({
      ...action,
      governorCalldata: governor ? governorIface.encodeFunctionData("propose", [action.target, 0, action.data]) : null
    })),
    warnings: []
  };
  if (!PAUSE_GUARDIAN_ADDRESS || actions.length === 0) {
    payload.warnings.push("pause_guardian_address_missing_or_invalid");
  }
  if (!governor) {
    payload.warnings.push("governor_address_missing_or_invalid");
  }
  return payload;
};

const recordProofOfIssue = async ({ layer, type, data, context }) => {
  if (!FINALITY_ENABLED) return;
  const ts = new Date().toISOString();
  const evidence = {
    id: `${layer}-${type}-${Date.now()}`,
    ts,
    layer,
    type,
    head: data ?? null,
    finality: context?.finality ?? null,
    bridge: context?.bridge ?? null,
    op: context?.op ?? null
  };
  const evidenceJson = JSON.stringify(evidence);
  const evidenceHash = ghost.keccak256(ghost.toUtf8Bytes(evidenceJson));
  const evidencePath = path.join(EVIDENCE_DIR, `proof-${layer}-${type}-${Date.now()}.json`);
  await writeJsonFile(evidencePath, { ...evidence, evidenceHash });
  logEvent("info", "proof_recorded", { layer, type, evidenceHash, file: evidencePath });

  if (!DRAFT_PROPOSALS_ENABLED) return;
  const proposal = buildProposalDraft({ layer, type, evidenceHash });
  const proposalPath = path.join(PROPOSAL_DIR, `proposal-${layer}-${type}-${Date.now()}.json`);
  await writeJsonFile(proposalPath, proposal);
  logEvent("info", "proposal_draft_written", { layer, type, file: proposalPath });
};

const fetchRegistry = async () => {
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

const resolveRpc = async (layer) => {
  const override = RPC_OVERRIDES[layer];
  if (override) return override;
  const registryData = await fetchRegistry();
  const chain = registryData.chains.find((entry) => entry.layer === layer);
  const rpc = pickRpc(chain);
  if (!rpc) throw new Error(`rpc_missing_${layer.toLowerCase()}`);
  return rpc;
};

const fetchBlockSafe = async (provider, tag) => {
  try {
    const block = await provider.getBlock(tag);
    if (!block) return null;
    return {
      number: parseNumber(block.number),
      hash: block.hash || null,
      timestamp: parseTimestamp(block.timestamp)
    };
  } catch (err) {
    return null;
  }
};

const fetchLayerStatus = async (layer, rpc) => {
  const provider = getProvider(rpc);
  const latest = await fetchBlockSafe(provider, "latest");
  const prevBlock = latest?.number ? await fetchBlockSafe(provider, latest.number - 1) : null;
  const safeBlock = await fetchBlockSafe(provider, "safe");
  const finalizedBlock = await fetchBlockSafe(provider, "finalized");

  let peerCount = null;
  try {
    peerCount = parseNumber(await provider.send("net_peerCount", []));
  } catch (err) {
    peerCount = null;
  }

  let syncing = false;
  try {
    const syncPayload = await provider.send("ghost_syncing", []);
    syncing = syncPayload && syncPayload !== false ? true : false;
  } catch (err) {
    syncing = false;
  }

  let txpoolPending = null;
  let txpoolQueued = null;
  try {
    const txpool = await provider.send("txpool_status", []);
    txpoolPending = parseNumber(txpool?.pending);
    txpoolQueued = parseNumber(txpool?.queued);
  } catch (err) {
    txpoolPending = null;
    txpoolQueued = null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const headAgeSec = latest?.timestamp ? Math.max(0, nowSec - latest.timestamp) : null;
  const blockTimeSec =
    latest?.timestamp && prevBlock?.timestamp
      ? Math.max(0, latest.timestamp - (prevBlock.timestamp || latest.timestamp))
      : null;

  return {
    layer,
    rpc,
    chainId: parseNumber(await provider.send("gst_chainId", [])),
    headNumber: latest?.number ?? null,
    headHash: latest?.hash ?? null,
    headTimestamp: latest?.timestamp ?? null,
    headAgeSec,
    blockTimeSec,
    safeBlock: safeBlock?.number ?? null,
    finalizedBlock: finalizedBlock?.number ?? null,
    peerCount,
    txpoolPending,
    txpoolQueued,
    syncing
  };
};

const fetchOpSyncStatus = async (rpc) => {
  if (!rpc) return null;
  try {
    const provider = getProvider(rpc);
    return await provider.send("optimism_syncStatus", []);
  } catch (err) {
    return { error: err?.message || "opnode_unreachable" };
  }
};

const normalizeOpEntry = (entry) => {
  if (!entry) return null;
  return {
    number: parseNumber(entry.number),
    hash: entry.hash || null,
    timestamp: parseTimestamp(entry.timestamp || entry.time)
  };
};

const normalizeOpStatus = (status) => {
  if (!status || status.error) return null;
  return {
    currentL1: normalizeOpEntry(status.currentL1),
    headL1: normalizeOpEntry(status.headL1),
    safeL2: normalizeOpEntry(status.safeL2),
    finalizedL2: normalizeOpEntry(status.finalizedL2),
    unsafeL2: normalizeOpEntry(status.unsafeL2)
  };
};

const computeIncidents = (layer, data, opStatus, l1HeadNumber) => {
  const incidents = {};
  if (!data || data.error) {
    incidents.rpc_error = true;
    return incidents;
  }

  if (data.headAgeSec !== null && data.headAgeSec > STALL_THRESHOLD_SEC[layer]) {
    incidents.stalled = true;
  }

  if (data.peerCount !== null && data.peerCount < PEER_MIN[layer]) {
    incidents.peer_drop = true;
  }

  if (data.syncing) {
    incidents.syncing = true;
  }

  const prev = previousHeads[layer];
  if (prev && data.headNumber !== null) {
    if (data.headNumber < prev.number) {
      incidents.reorg_risk = true;
    }
    if (data.headNumber === prev.number && prev.hash && data.headHash && prev.hash !== data.headHash) {
      incidents.reorg_risk = true;
    }
  }

  const normalizedOp = normalizeOpStatus(opStatus);
  if (normalizedOp) {
    const unsafeNum = normalizedOp.unsafeL2?.number;
    const safeNum = normalizedOp.safeL2?.number;
    const finalizedNum = normalizedOp.finalizedL2?.number;

    if (unsafeNum !== null && safeNum !== null && unsafeNum - safeNum > OP_SAFE_LAG_BLOCKS) {
      incidents.oracle_lag = true;
    }

    if (safeNum !== null && finalizedNum !== null && safeNum - finalizedNum > OP_FINALIZED_LAG_BLOCKS) {
      incidents.finalized_lag = true;
    }

    if (l1HeadNumber !== null && normalizedOp.currentL1?.number !== null) {
      if (l1HeadNumber - normalizedOp.currentL1.number > OP_L1_LAG_BLOCKS) {
        incidents.portal_lag = true;
      }
    }
  }

  return incidents;
};

const updateMetricsForLayer = (layer, data, incidents, opStatus) => {
  const setGaugeValue = (gauge, labels, value) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      gauge.set(labels, -1);
      return;
    }
    gauge.set(labels, value);
  };

  layerUpGauge.set({ layer }, data && !data.error ? 1 : 0);

  setGaugeValue(headBlockGauge, { layer }, data?.headNumber);
  setGaugeValue(headAgeGauge, { layer }, data?.headAgeSec);
  setGaugeValue(blockTimeGauge, { layer }, data?.blockTimeSec);
  setGaugeValue(peerGauge, { layer }, data?.peerCount);
  setGaugeValue(txpoolGauge, { layer, state: "pending" }, data?.txpoolPending);
  setGaugeValue(txpoolGauge, { layer, state: "queued" }, data?.txpoolQueued);
  setGaugeValue(safeBlockGauge, { layer }, data?.safeBlock);
  setGaugeValue(finalizedBlockGauge, { layer }, data?.finalizedBlock);
  syncingGauge.set({ layer }, data?.syncing ? 1 : 0);

  const normalizedOp = normalizeOpStatus(opStatus);
  if (normalizedOp) {
    const unsafeNum = normalizedOp.unsafeL2?.number;
    const safeNum = normalizedOp.safeL2?.number;
    const finalizedNum = normalizedOp.finalizedL2?.number;
    if (unsafeNum !== null && safeNum !== null) {
      setGaugeValue(opLagGauge, { layer, type: "unsafe_safe" }, Math.max(0, unsafeNum - safeNum));
    }
    if (safeNum !== null && finalizedNum !== null) {
      setGaugeValue(opLagGauge, { layer, type: "safe_finalized" }, Math.max(0, safeNum - finalizedNum));
    }
  } else if (layer === "L2" || layer === "L3") {
    setGaugeValue(opLagGauge, { layer, type: "unsafe_safe" }, null);
    setGaugeValue(opLagGauge, { layer, type: "safe_finalized" }, null);
  }

  const incidentTypes = new Set([
    ...Object.keys(incidents || {}),
    ...Object.keys(incidentState[layer] || {})
  ]);
  for (const type of incidentTypes) {
    incidentGauge.set({ layer, type }, incidents?.[type] ? 1 : 0);
  }
};

const updateFinalityMetrics = ({ layer, oracleSnapshot, headTimestamp }) => {
  const setGaugeValue = (gauge, labels, value) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      gauge.set(labels, -1);
      return;
    }
    gauge.set(labels, value);
  };

  if (layer === "L2" || layer === "L3") {
    setGaugeValue(outputOracleBlockGauge, { layer }, oracleSnapshot?.latestBlockNumber ?? null);
    setGaugeValue(outputOracleIndexGauge, { layer }, oracleSnapshot?.latestOutputIndex ?? null);
    if (headTimestamp && oracleSnapshot?.outputTimestamp) {
      const age = Math.max(0, headTimestamp - oracleSnapshot.outputTimestamp);
      setGaugeValue(outputOracleAgeGauge, { layer }, age);
    } else {
      setGaugeValue(outputOracleAgeGauge, { layer }, null);
    }
  }
};

const updateBridgeMetrics = (bridgeStatus) => {
  if (!bridgeStatus || !bridgeStatus.configured) return;
  bridgePendingGauge.set({ type: "native" }, bridgeStatus.pendingDeposits ?? 0);
  bridgePendingGauge.set({ type: "erc20" }, bridgeStatus.pendingErc20Deposits ?? 0);
  if (bridgeStatus.oldestPendingAgeSec === null || bridgeStatus.oldestPendingAgeSec === undefined) {
    bridgeOldestAgeGauge.set(-1);
  } else {
    bridgeOldestAgeGauge.set(bridgeStatus.oldestPendingAgeSec);
  }
  if (bridgeStatus.lastProcessedBlock !== null && bridgeStatus.lastProcessedBlock !== undefined) {
    bridgeLastScannedGauge.set({ layer: "L2" }, bridgeStatus.lastProcessedBlock);
  }
};

const postWebhook = async (payload) => {
  if (!ALERT_WEBHOOK_URL) return;
  const key = `${payload.layer}:${payload.type}:${payload.active ? "open" : "clear"}`;
  const lastAt = alertThrottle.get(key) || 0;
  if (Date.now() - lastAt < ALERT_WEBHOOK_COOLDOWN_MS) return;

  alertThrottle.set(key, Date.now());
  let lastErr;
  for (let attempt = 0; attempt <= ALERT_WEBHOOK_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ALERT_WEBHOOK_TIMEOUT_MS);
    try {
      const res = await fetch(ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`webhook_http_${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < ALERT_WEBHOOK_RETRIES) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  logEvent("warn", "alert_webhook_failed", { error: lastErr?.message || String(lastErr) });
};

const registerIncidentTransitions = (layer, incidents, data, context) => {
  if (!incidentState[layer]) incidentState[layer] = {};
  const allTypes = new Set([...Object.keys(incidents), ...Object.keys(incidentState[layer])]);
  for (const type of allTypes) {
    const current = Boolean(incidents[type]);
    const previous = Boolean(incidentState[layer][type]);
    if (current !== previous) {
      incidentState[layer][type] = current;
      alertsCounter.inc({ layer, type, action: current ? "open" : "clear" });
      logEvent(current ? "warn" : "info", "incident_state_change", {
        layer,
        type,
        active: current,
        headNumber: data?.headNumber ?? null
      });
      if (current && FINALITY_ENABLED && (type.startsWith("oracle_") || type.startsWith("bridge_"))) {
        recordProofOfIssue({ layer, type, data, context }).catch((err) => {
          logEvent("warn", "proof_record_failed", { layer, type, error: err?.message || String(err) });
        });
      }
      postWebhook({
        ts: new Date().toISOString(),
        layer,
        type,
        active: current,
        headNumber: data?.headNumber ?? null,
        headAgeSec: data?.headAgeSec ?? null
      });
    }
  }
};

const pollLayer = async (layer) => {
  try {
    const rpc = await resolveRpc(layer);
    const [base, opStatus] = await Promise.all([
      fetchLayerStatus(layer, rpc),
      layer === "L2" || layer === "L3" ? fetchOpSyncStatus(OP_NODE_RPC[layer]) : Promise.resolve(null)
    ]);
    return { layer, base, opStatus };
  } catch (err) {
    return { layer, base: { error: err?.message || String(err) }, opStatus: null };
  }
};

const pollOnce = async () => {
  if (pollInFlight) return;
  pollInFlight = true;
  const start = Date.now();

  try {
    const results = await Promise.all(LAYERS.map((layer) => pollLayer(layer)));
    for (const result of results) {
      state.layers[result.layer] = result.base;
      state.op[result.layer] = result.opStatus || null;

      if (!result.base?.error && result.base?.headNumber !== null) {
        previousHeads[result.layer] = { number: result.base.headNumber, hash: result.base.headHash };
      }
    }

    let finalitySnapshots = { L2: null, L3: null };
    let bridgeStatus = null;
    if (FINALITY_ENABLED) {
      const l1Rpc = L2_OUTPUT_ORACLE_RPC || state.layers.L1?.rpc || "";
      const l2Rpc = L3_OUTPUT_ORACLE_RPC || state.layers.L2?.rpc || "";
      finalitySnapshots = {
        L2: await fetchOutputOracleSnapshot(
          "L2",
          l1Rpc,
          L2_OUTPUT_ORACLE_ADDRESS,
          state.layers.L1?.chainId ?? null
        ),
        L3: await fetchOutputOracleSnapshot(
          "L3",
          l2Rpc,
          L3_OUTPUT_ORACLE_ADDRESS,
          state.layers.L2?.chainId ?? null
        )
      };
      state.finality = finalitySnapshots;
    } else {
      state.finality = {};
    }

    if (BRIDGE_WATCH_ENABLED) {
      bridgeStatus = await fetchBridgeStatus({
        rpc: state.layers.L2?.rpc || "",
        headNumber: state.layers.L2?.headNumber ?? null,
        headTimestamp: state.layers.L2?.headTimestamp ?? null
      });
      state.bridge = bridgeStatus;
      updateBridgeMetrics(bridgeStatus);
    } else {
      state.bridge = null;
    }

    const l1Head = state.layers.L1?.headNumber ?? null;
    for (const layer of LAYERS) {
      const data = state.layers[layer];
      const incidents = computeIncidents(layer, data, state.op[layer], l1Head);
      const extraIncidents = {};
      if (layer === "L2") {
        if (finalitySnapshots.L2?.configured) {
          Object.assign(
            extraIncidents,
            computeOracleIncidents({
              snapshot: finalitySnapshots.L2,
              headNumber: state.layers.L2?.headNumber ?? null,
              headTimestamp: state.layers.L1?.headTimestamp ?? null,
              maxBlockDrift: ORACLE_MAX_BLOCK_DRIFT_L2,
              maxAgeSec: ORACLE_MAX_AGE_SEC_L2
            })
          );
        }
        updateFinalityMetrics({
          layer,
          oracleSnapshot: finalitySnapshots.L2,
          headTimestamp: state.layers.L1?.headTimestamp ?? null
        });
      }
      if (layer === "L3") {
        if (finalitySnapshots.L3?.configured) {
          Object.assign(
            extraIncidents,
            computeOracleIncidents({
              snapshot: finalitySnapshots.L3,
              headNumber: state.layers.L3?.headNumber ?? null,
              headTimestamp: state.layers.L2?.headTimestamp ?? null,
              maxBlockDrift: ORACLE_MAX_BLOCK_DRIFT_L3,
              maxAgeSec: ORACLE_MAX_AGE_SEC_L3
            })
          );
        }
        updateFinalityMetrics({
          layer,
          oracleSnapshot: finalitySnapshots.L3,
          headTimestamp: state.layers.L2?.headTimestamp ?? null
        });
      }
      if (layer === "L2" && bridgeStatus?.incidents) {
        Object.assign(extraIncidents, bridgeStatus.incidents);
      }
      const mergedIncidents = { ...incidents, ...extraIncidents };
      state.incidents[layer] = mergedIncidents;
      updateMetricsForLayer(layer, data, mergedIncidents, state.op[layer]);
      registerIncidentTransitions(layer, mergedIncidents, data, {
        finality: finalitySnapshots[layer] || null,
        bridge: layer === "L2" ? bridgeStatus : null,
        op: state.op[layer] || null
      });
    }

    state.lastPollAt = Date.now();
    state.ready =
      LAYERS.every((layer) => state.layers[layer] && !state.layers[layer].error) &&
      Date.now() - state.lastPollAt < READY_MAX_STALE_MS;
    state.lastError = null;
  } catch (err) {
    state.lastError = err?.message || String(err);
    logEvent("error", "poll_failed", { error: state.lastError });
  } finally {
    pollDuration.observe((Date.now() - start) / 1000);
    pollInFlight = false;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "consensus-telemetry-service" }));
app.get("/healthz", (_req, res) => res.json({ ok: true, service: "consensus-telemetry-service" }));
app.get("/readyz", (_req, res) => {
  const ready = state.ready && Date.now() - state.lastPollAt < READY_MAX_STALE_MS;
  res.status(ready ? 200 : 503).json({ ok: ready, lastPollAt: state.lastPollAt });
});

app.get("/metrics", async (_req, res) => {
  if (!METRICS_ENABLED) {
    res.status(404).send("metrics disabled");
    return;
  }
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});

app.get("/consensus", (_req, res) => {
  res.json({
    ok: true,
    lastPollAt: state.lastPollAt,
    ready: state.ready,
    layers: state.layers,
    incidents: state.incidents,
    op: state.op,
    finality: state.finality,
    bridge: state.bridge
  });
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

const startService = async () => {
  await initFinalityState();
  const server = app.listen(PORT, "0.0.0.0", () => {
    logEvent("info", "service_started", { port: PORT, pollIntervalMs: POLL_INTERVAL_MS });
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
  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS).unref();
};

if (process.env.CONSENSUS_TELEMETRY_NO_SERVER !== "1") {
  startService().catch((err) => {
    logEvent("error", "service_start_failed", { error: err?.message || String(err) });
  });
}

export const __test = {
  computeOracleIncidents,
  buildBridgeKey,
  applyBridgeEvent
};
