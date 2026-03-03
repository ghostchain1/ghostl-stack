import express from "express";
import net from "net";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { ethers } from "ethers";
import Docker from "dockerode";
import {
  connectGhostBrain,
  disconnectGhostBrain,
  publishHealthSignal,
  publishAnomalySignal,
} from "./ghostbrain-client.js";

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
app.use(express.json());

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
  ethers.keccak256(ethers.toUtf8Bytes(stableStringify(planPayload(plan))));

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
      recovered = ethers.verifyMessage(message, signature).toLowerCase();
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
  try {
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
  } catch (err) {
    // Registry unavailable — fall back to env-var override (degraded mode)
    if (override) {
      logEvent("warn", "registry_fallback", { layer, override, reason: err?.message || String(err) });
      return override;
    }
    throw err;
  }
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
      const data = await fetchJson(t.url, { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
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

  // ── GhostBrain Core: publish network health/anomaly signals ─────────────────
  const overallOk = errors.length === 0;
  if (overallOk) {
    publishHealthSignal({
      ok:      true,
      source:  "network-manager-service",
      metrics: { checked: results.length, failed: 0 },
      errors:  [],
    });
  } else {
    publishAnomalySignal({
      source:      "network-manager-service",
      severity:    errors.some((e) => e.type === "rpc") ? "critical" : "warning",
      description: `${errors.length} network check(s) failed`,
      metrics:     { checked: results.length, failed: errors.length },
      errors:      errors.map((e) => e.error ?? e.target ?? "unknown"),
    });
  }
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
      const provider = new ethers.JsonRpcProvider(GOVERNANCE_RPC);
      const governor = new ethers.Contract(GOVERNOR_ADDRESS, GOVERNOR_ABI, provider);
      const executorAddr = await governor.executor();
      const executor = new ethers.Contract(executorAddr, EXECUTOR_ABI, provider);
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
  const provider = new ethers.JsonRpcProvider(GOVERNANCE_RPC || process.env.RPC_L1);
  const guardian = new ethers.Contract(PAUSE_GUARDIAN_ADDRESS, PAUSE_GUARDIAN_ABI, provider);
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

  const provider = new ethers.JsonRpcProvider(GOVERNANCE_RPC);
  const governor = new ethers.Contract(GOVERNOR_ADDRESS, GOVERNOR_ABI, provider);
  const executorAddr = await governor.executor();
  const executorAddrLower = String(executorAddr).toLowerCase();
  const executor = new ethers.Contract(executorAddr, EXECUTOR_ABI, provider);
  const delaySeconds = Number(await executor.delay());

  const anchorAddr = plan.governance?.evidenceAnchor || EVIDENCE_ANCHOR_ADDRESS;
  const anchor = new ethers.Contract(anchorAddr, EVIDENCE_ANCHOR_ABI, provider);
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
    evidence.executionHash = ethers.keccak256(ethers.toUtf8Bytes(stableStringify(evidence)));
    const evidencePath = await writeEvidence(evidence);

    const requirePost = policy?.postconditions?.requireTelemetryAfter ?? DEFAULT_POLICY.postconditions.requireTelemetryAfter;
    const ok = requirePost ? postTelemetryCheck.ok : true;
    res.json({ ok, results, evidencePath, executionHash: evidence.executionHash, postconditions: evidence.postconditions });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

async function init() {
  try {
    await loadPolicy();

    // Resolve RPC targets — falls back to env-var overrides if registry is down
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

    // ── GhostBrain Core: connect as autonomous AI network agent ──────────────
    await connectGhostBrain(async (task) => {
      // Autonomous task dispatch from GhostBrain orchestrator
      // Supported: { type: "probe" }, { type: "op_gate_mode", ... },
      //            { type: "restart_service", ... }
      logEvent("info", "ghostbrain_autonomous_task", { taskType: task?.type });
      if (task?.type === "probe") {
        await probe();
        return { ok: true, results: state.results, errors: state.errors };
      }
      if (task?.type === "op_gate_mode" || task?.type === "restart_service") {
        // Wrap as a plan action and delegate to execute logic
        if (!AUTONOMY_EXECUTION_ENABLED) return { ok: false, error: "autonomy_execution_disabled" };
        if (AUTONOMY_KILL_SWITCH)         return { ok: false, error: "autonomy_kill_switch_enabled" };
        const handler = supportedActions[task.type];
        if (!handler) return { ok: false, error: `unsupported_action:${task.type}` };
        const result = await handler(task);
        return { ok: true, result };
      }
      return { ok: false, error: `unknown_task_type:${task?.type}` };
    });

    const intervalMs = Number(process.env.MONITOR_INTERVAL_MS || "10000");
    setInterval(probe, intervalMs);
    probe().catch(() => {});

    const server = app.listen(PORT, () => {
      console.log(`[netmgr] listening on :${PORT}`);
    });

    const shutdown = async (signal) => {
      logEvent("info", "shutdown", { signal });
      await disconnectGhostBrain();
      server.close(() => process.exit(0));
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT",  () => void shutdown("SIGINT"));

  } catch (err) {
    console.error(`[netmgr] fatal init error: ${err?.message || err}`);
    process.exit(1);
  }
}

init();
