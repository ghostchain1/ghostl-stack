import express from "express";
import client from "prom-client";

const env = process.env;
const registryUrl = env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const rpcOverride = env.RPC_URL || env.RPC_L2 || env.RPC_L1 || env.RPC_L3 || "";
const registryTimeoutMs = Number(env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };
const GUARD_URL = env.GUARD_URL || "http://host.docker.internal:7070";
const ADMIN_TOKEN = env.ADMIN_TOKEN || "";
const PORT = Number(env.PORT || 7575);
const OBSERVE_ONLY = env.OBSERVE_ONLY === "1";
const SIMULATION_ENABLED = env.SIMULATION_ENABLED === "1";
const TARGET_LAYER = String(env.TARGET_LAYER || "L2").toUpperCase();
const RPC_L1 = env.RPC_L1 || "";
const OP_NODE_RPC_URL = env.OP_NODE_RPC_URL || "";
const OP_BATCHER_METRICS_URL = env.OP_BATCHER_METRICS_URL || "";
const OP_PROPOSER_METRICS_URL = env.OP_PROPOSER_METRICS_URL || "";
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

const app = express();
app.use(express.json());

const logEvent = (level, message, extra = {}) => {
  const payload = { ts: new Date().toISOString(), level, message, layer: TARGET_LAYER, ...extra };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
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

const headers = ADMIN_TOKEN ? { "content-type": "application/json", "x-admin-token": ADMIN_TOKEN } : { "content-type": "application/json" };

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

async function maybeAdjustPolicy(score, congestion) {
  actionGauge.set(0);
  if (score >= PAUSE_THRESHOLD) {
    // For now, use a high delay instead of hard pause to avoid mode flapping.
    const secs = Math.min(MAX_DELAY_MS / 1000, 10);
    await setDelay(secs);
    actionGauge.set(2);
    return "pause";
  }
  if (score >= THROTTLE_THRESHOLD || congestion >= THROTTLE_THRESHOLD) {
    const factor = Math.min(1, Math.max(score, congestion) / 100);
    const delayMs = Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, BASE_DELAY_MS * factor * 2));
    await setDelay(Math.round(delayMs / 1000));
    actionGauge.set(1);
    return "delay";
  }
  // Clear delay if low risk.
  await setDelay(0);
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
  proposerMetricsError
}) {
  const incidents = [];
  if (rpcError) incidents.push("l2_rpc_unreachable");
  if (l1RpcError) incidents.push("l1_rpc_unreachable");
  if (opNodeError) incidents.push("op_node_unreachable");
  if (syncing) incidents.push("syncing");
  if (headLag > HEAD_LAG_THRESHOLD_SEC) incidents.push("l2_head_stale");
  if (l1HeadLag > L1_HEAD_LAG_THRESHOLD_SEC) incidents.push("l1_head_stale");
  if (peers < MIN_PEERS) incidents.push("low_peers");
  if (reorged) incidents.push("reorg_detected");
  if (batcherStalled) incidents.push("batcher_stalled");
  if (proposerStalled) incidents.push("proposer_stalled");
  if (batcherMetricsError) incidents.push("batcher_metrics_unreachable");
  if (proposerMetricsError) incidents.push("proposer_metrics_unreachable");
  return incidents;
}

function recommendFix(incidents) {
  if (!incidents.length) return "";
  if (incidents.includes("l2_rpc_unreachable")) return "Check L2 RPC proxy/container health, restart L2 node if needed.";
  if (incidents.includes("l1_rpc_unreachable")) return "Check L1 RPC proxy/container health and network connectivity.";
  if (incidents.includes("op_node_unreachable")) return "Check op-node health and restart if needed.";
  if (incidents.includes("syncing")) return "Node syncing; verify disk IO and peer connectivity.";
  if (incidents.includes("l2_head_stale")) return "Investigate L2 node lag; check CPU/memory and peer count.";
  if (incidents.includes("l1_head_stale")) return "Investigate L1 RPC lag and op-node derivation.";
  if (incidents.includes("low_peers")) return "Check P2P connectivity and firewall rules.";
  if (incidents.includes("reorg_detected")) return "Investigate validator health and network stability.";
  if (incidents.includes("batcher_stalled")) return "Restart op-batcher and verify batcher key/L1 RPC.";
  if (incidents.includes("proposer_stalled")) return "Restart op-proposer and verify proposer key/L1 RPC.";
  if (incidents.includes("batcher_metrics_unreachable")) return "Check op-batcher metrics endpoint or container health.";
  if (incidents.includes("proposer_metrics_unreachable")) return "Check op-proposer metrics endpoint or container health.";
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
    if (simulation?.active) {
      latestBlock = simulation.latestBlock;
      peersRaw = simulation.peersRaw ?? "0x0";
      syncing = simulation.syncing ?? false;
    } else {
      latestBlock = await rpc("eth_getBlockByNumber", ["latest", true]);
      peersRaw = await rpc("net_peerCount");
      syncing = await rpc("eth_syncing");
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
        await rpcRequest(RPC_L1, "eth_chainId");
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
      proposerMetricsError
    });
    incidentGauge.reset();
    incidents.forEach((type) => incidentGauge.labels(type).set(1));
    const action = await maybeAdjustPolicy(risk, congestion);
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
      opNodeError
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
      incidents: ["rpc_unreachable"],
      recommendedAction: "throttle",
      recommendedFix: "Check RPC proxy/container health, restart node if needed."
    };
    incidentGauge.reset();
    incidentGauge.labels("rpc_unreachable").set(1);
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
    rpcOverride: Boolean(rpcOverride)
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

async function init() {
  try {
    rpcL2 = await resolveRpc();
    app.listen(PORT, () => {
      logEvent("info", "ai_monitor_listen", {
        port: PORT,
        rpc: rpcL2,
        guard: GUARD_URL,
        observeOnly: OBSERVE_ONLY
      });
      loop();
    });
  } catch (err) {
    logEvent("error", "registry_error", { error: err?.message || String(err) });
    process.exit(1);
  }
}

init();
