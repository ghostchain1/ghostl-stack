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
const TARGET_LAYER = String(env.TARGET_LAYER || "L2").toUpperCase();
const THROTTLE_THRESHOLD = Number(env.THROTTLE_THRESHOLD || 70);
const PAUSE_THRESHOLD = Number(env.PAUSE_THRESHOLD || 90);
const BASE_DELAY_MS = Number(env.BASE_DELAY_MS || 2000);
const MAX_DELAY_MS = Number(env.MAX_DELAY_MS || 8000);
const LOOP_MS = Number(env.LOOP_MS || 5000);
const HEAD_LAG_THRESHOLD_SEC = Number(env.HEAD_LAG_THRESHOLD_SEC || 30);
const MIN_PEERS = Number(env.MIN_PEERS || 1);
const REORG_PENALTY = Number(env.REORG_PENALTY || 15);
const STALE_PENALTY = Number(env.STALE_PENALTY || 25);
const SYNCING_PENALTY = Number(env.SYNCING_PENALTY || 20);
const LOW_PEER_PENALTY = Number(env.LOW_PEER_PENALTY || 15);

const app = express();
app.use(express.json());

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const riskGauge = new client.Gauge({ name: "ai_monitor_risk_score", help: "Latest risk score 0-100" });
const anomalyGauge = new client.Gauge({ name: "ai_monitor_anomaly_score", help: "Latest anomaly score 0-100" });
const congestionGauge = new client.Gauge({ name: "ai_monitor_congestion_score", help: "Latest congestion score 0-100" });
const actionGauge = new client.Gauge({ name: "ai_monitor_last_action", help: "0=none,1=delay,2=pause" });
const headLagGauge = new client.Gauge({ name: "ai_monitor_head_lag_seconds", help: "Head lag in seconds" });
const peerGauge = new client.Gauge({ name: "ai_monitor_peer_count", help: "Latest peer count" });
const syncingGauge = new client.Gauge({ name: "ai_monitor_syncing", help: "1 if syncing" });
const reorgCounter = new client.Counter({ name: "ai_monitor_reorgs_total", help: "Detected head reorgs" });
registry.registerMetric(riskGauge);
registry.registerMetric(anomalyGauge);
registry.registerMetric(congestionGauge);
registry.registerMetric(actionGauge);
registry.registerMetric(headLagGauge);
registry.registerMetric(peerGauge);
registry.registerMetric(syncingGauge);
registry.registerMetric(reorgCounter);

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

async function rpc(method, params = []) {
  const res = await fetch(rpcL2, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!res.ok) throw new Error(`RPC ${method} status ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method} error: ${body.error.message || body.error}`);
  return body.result;
}

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
    return;
  }
  if (score >= THROTTLE_THRESHOLD || congestion >= THROTTLE_THRESHOLD) {
    const factor = Math.min(1, Math.max(score, congestion) / 100);
    const delayMs = Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, BASE_DELAY_MS * factor * 2));
    await setDelay(Math.round(delayMs / 1000));
    actionGauge.set(1);
    return;
  }
  // Clear delay if low risk.
  await setDelay(0);
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

async function loop() {
  try {
    const latestBlock = await rpc("eth_getBlockByNumber", ["latest", true]);
    const peersRaw = await rpc("net_peerCount");
    const syncing = await rpc("eth_syncing");
    const peers = parseHexNumber(peersRaw, 0);
    const headNumber = parseHexNumber(latestBlock.number, null);
    const headHash = latestBlock.hash || null;
    if (headNumber !== null && lastHeadNumber !== null) {
      if (headNumber < lastHeadNumber || (headNumber === lastHeadNumber && headHash && headHash !== lastHeadHash)) {
        reorgCounter.inc();
      }
    }
    lastHeadNumber = headNumber;
    lastHeadHash = headHash;

    const headTs = parseHexNumber(latestBlock.timestamp, null);
    const nowSec = Math.floor(Date.now() / 1000);
    const headLag = headTs ? Math.max(0, nowSec - headTs) : 0;

    let anomaly = 0;
    if (syncing && syncing !== false) anomaly = Math.min(100, anomaly + SYNCING_PENALTY);
    if (headLag > HEAD_LAG_THRESHOLD_SEC) anomaly = Math.min(100, anomaly + STALE_PENALTY);
    if (peers < MIN_PEERS) anomaly = Math.min(100, anomaly + LOW_PEER_PENALTY);
    anomalyGauge.set(anomaly);
    headLagGauge.set(headLag);
    peerGauge.set(peers);
    syncingGauge.set(syncing && syncing !== false ? 1 : 0);

    const { risk: congestionRisk, congestion } = computeScores(latestBlock);
    const risk = Math.min(100, Math.max(congestionRisk, anomaly));
    riskGauge.set(risk);
    congestionGauge.set(congestion);
    await maybeAdjustPolicy(risk, congestion);
  } catch (e) {
    console.error("[ai-monitor] loop error:", e?.message || e);
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

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

async function init() {
  try {
    rpcL2 = await resolveRpc();
    app.listen(PORT, () => {
      console.log(
        `[ai-monitor] listening on ${PORT}, layer=${TARGET_LAYER}, polling ${rpcL2}, guard=${GUARD_URL}, observeOnly=${OBSERVE_ONLY}`
      );
      loop();
    });
  } catch (err) {
    console.error("[ai-monitor] registry error:", err?.message || err);
    process.exit(1);
  }
}

init();
