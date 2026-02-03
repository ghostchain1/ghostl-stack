#!/usr/bin/env node
import http from "http";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };
const rpcTimeoutMs = Number(process.env.RPC_TIMEOUT_MS || 4000);
const proxyTimeoutMs = Number(process.env.PROXY_TIMEOUT_MS || 10000);
const proxyAuthToken = process.env.CLOCK_SYNC_PROXY_TOKEN || "";
const metricsPath = process.env.METRICS_PATH || "/metrics";
const vaultAddr = process.env.VAULT_ADDR || "";
const vaultToken = process.env.VAULT_TOKEN || "";
const vaultPath = process.env.VAULT_PATH || "secret/data/ghost/ai-clock-sync";
const vaultTimeoutMs = Number(process.env.VAULT_TIMEOUT_MS || 2000);

const metrics = {
  registryErrors: 0,
  rpcErrors: {},
  proxyRequests: {},
  proxyInFlight: 0
};

const inc = (map, key, by = 1) => {
  map[key] = (map[key] || 0) + by;
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
      if (attempt < registryRetries) await sleep(150 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  metrics.registryErrors += 1;
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

const resolveRpc = async (layer, override) => {
  let registry;
  try {
    registry = await fetchRegistry();
  } catch (err) {
    if (override) {
      log("warn", `registry unavailable, using override for ${layer}`);
      return override;
    }
    throw err;
  }
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
};

let rpcL1 = "";
let rpcL2 = "";
let rpcL3 = "";
const pollMs = Number(process.env.CLOCK_SYNC_INTERVAL_MS || 5000);
const warnThreshold = Number(process.env.CLOCK_SYNC_DRIFT_THRESHOLD_SEC || 2);
const listenPort = Number(process.env.PORT || 7690);

let chains = [];

const state = {};

async function rpcCall(rpc, method, params = [], attempts = 3) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), rpcTimeoutMs);
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error(`rpc ${method} http ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      return data.result;
    } catch (err) {
      lastErr = err;
      await sleep(200 * (i + 1)); // backoff a little to reduce bursty drift alarms
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function hexToNumber(hex) {
  if (!hex) return 0;
  return Number(BigInt(hex));
}

async function checkChain({ name, rpc }) {
  try {
    const [chainIdHex, blockNumberHex] = await Promise.all([
      rpcCall(rpc, "eth_chainId"),
      rpcCall(rpc, "eth_blockNumber")
    ]);
    const block = await rpcCall(rpc, "eth_getBlockByNumber", [blockNumberHex, false]);
    const bn = hexToNumber(blockNumberHex);
    const now = Math.floor(Date.now() / 1000);
    const drift = now - Number(block?.timestamp ? BigInt(block.timestamp) : 0n);
    state[name] = {
      rpc,
      chainId: hexToNumber(chainIdHex).toString(),
      blockNumber: bn,
      blockTimestamp: block?.timestamp ? hexToNumber(block.timestamp) : null,
      now,
      driftSeconds: drift,
      ok: Math.abs(drift) <= warnThreshold
    };
    const level = state[name].ok ? "info" : "warn";
    const freshness = block?.timestamp ? Math.max(0, now - hexToNumber(block.timestamp)) : null;
    if (freshness !== null && freshness > warnThreshold * 3) {
      log("warn", `${name} tip is stale by ${freshness}s (block ${bn})`);
    }
    log(level, `${name} drift ${drift}s (block ${bn}, ts ${block?.timestamp})`);
  } catch (err) {
    state[name] = { rpc, error: err?.message || String(err) };
    inc(metrics.rpcErrors, name);
    log("error", `${name} rpc error: ${state[name].error}`);
  }
}

function log(level, msg) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`${ts} [${level}] ${msg}`);
}

function formatMetrics() {
  const lines = [];
  lines.push("# HELP ai_clock_sync_drift_seconds Clock drift in seconds between local time and chain tip");
  lines.push("# TYPE ai_clock_sync_drift_seconds gauge");
  lines.push("# HELP ai_clock_sync_ok Whether drift is within the configured threshold (1 ok, 0 not ok)");
  lines.push("# TYPE ai_clock_sync_ok gauge");
  lines.push("# HELP ai_clock_sync_block_number Latest observed block number");
  lines.push("# TYPE ai_clock_sync_block_number gauge");
  lines.push("# HELP ai_clock_sync_block_timestamp Latest observed block timestamp (unix)");
  lines.push("# TYPE ai_clock_sync_block_timestamp gauge");
  lines.push("# HELP ai_clock_sync_rpc_errors_total RPC errors per chain");
  lines.push("# TYPE ai_clock_sync_rpc_errors_total counter");
  lines.push("# HELP ai_clock_sync_registry_errors_total Registry fetch errors");
  lines.push("# TYPE ai_clock_sync_registry_errors_total counter");
  lines.push("# HELP ai_clock_sync_proxy_requests_total Proxy requests by chain and HTTP status");
  lines.push("# TYPE ai_clock_sync_proxy_requests_total counter");
  lines.push("# HELP ai_clock_sync_proxy_inflight In-flight proxy requests");
  lines.push("# TYPE ai_clock_sync_proxy_inflight gauge");

  for (const [name, data] of Object.entries(state)) {
    if (!data || typeof data !== "object") continue;
    const chain = name;
    if (typeof data.driftSeconds === "number") {
      lines.push(`ai_clock_sync_drift_seconds{chain="${chain}"} ${data.driftSeconds}`);
    }
    if (typeof data.ok === "boolean") {
      lines.push(`ai_clock_sync_ok{chain="${chain}"} ${data.ok ? 1 : 0}`);
    }
    if (typeof data.blockNumber === "number") {
      lines.push(`ai_clock_sync_block_number{chain="${chain}"} ${data.blockNumber}`);
    }
    if (typeof data.blockTimestamp === "number") {
      lines.push(`ai_clock_sync_block_timestamp{chain="${chain}"} ${data.blockTimestamp}`);
    }
  }

  for (const [chain, count] of Object.entries(metrics.rpcErrors)) {
    lines.push(`ai_clock_sync_rpc_errors_total{chain="${chain}"} ${count}`);
  }
  lines.push(`ai_clock_sync_registry_errors_total ${metrics.registryErrors}`);
  for (const [key, count] of Object.entries(metrics.proxyRequests)) {
    const [chain, code] = key.split("|");
    lines.push(`ai_clock_sync_proxy_requests_total{chain="${chain}",code="${code}"} ${count}`);
  }
  lines.push(`ai_clock_sync_proxy_inflight ${metrics.proxyInFlight}`);
  return lines.join("\n") + "\n";
}

async function loadVaultEnv() {
  if (!vaultAddr || !vaultToken) return;
  const url = `${vaultAddr.replace(/\/$/, "")}/v1/${vaultPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), vaultTimeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "X-Vault-Token": vaultToken },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`vault_http_${res.status}`);
    const body = await res.json();
    const data = body?.data?.data || body?.data;
    if (!data || typeof data !== "object") throw new Error("vault_invalid");
    const allow = new Set([
      "CLOCK_SYNC_RPC_L1",
      "CLOCK_SYNC_RPC_L2",
      "CLOCK_SYNC_RPC_L3",
      "RPC_REGISTRY_URL",
      "REGISTRY_TIMEOUT_MS",
      "REGISTRY_RETRY_COUNT",
      "REGISTRY_CACHE_MS",
      "CLOCK_SYNC_INTERVAL_MS",
      "CLOCK_SYNC_DRIFT_THRESHOLD_SEC",
      "RPC_TIMEOUT_MS",
      "PROXY_TIMEOUT_MS",
      "CLOCK_SYNC_PROXY_TOKEN"
    ]);
    for (const [key, value] of Object.entries(data)) {
      if (!allow.has(key)) continue;
      if (value === null || value === undefined) continue;
      process.env[key] = String(value);
    }
    log("info", "vault env loaded");
  } catch (err) {
    log("error", `vault env load failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

async function loop() {
  while (true) {
    await Promise.all(chains.map(checkChain));
    await sleep(pollMs);
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      const path = (req.url || "/").split("?")[0];
      // Middleware proxy: POST /l1, /l2, or /l3 forwards JSON-RPC to the corresponding chain
      const target = path === "/l1" ? rpcL1 : path === "/l2" ? rpcL2 : path === "/l3" ? rpcL3 : null;
      if (!target) {
        res.writeHead(404);
        return res.end();
      }
      if (proxyAuthToken) {
        const authHeader = String(req.headers.authorization || "");
        const token =
          authHeader.startsWith("Bearer ") ? authHeader.slice(7) : String(req.headers["x-clock-sync-token"] || "");
        if (token !== proxyAuthToken) {
          res.writeHead(401, { "content-type": "application/json" });
          inc(metrics.proxyRequests, `${path.slice(1)}|401`);
          return res.end(JSON.stringify({ error: "unauthorized" }));
        }
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        let timer;
        try {
          metrics.proxyInFlight += 1;
          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(), proxyTimeoutMs);
          const proxied = await fetch(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: controller.signal
          });
          const text = await proxied.text();
          res.writeHead(proxied.status, { "content-type": proxied.headers.get("content-type") || "application/json" });
          res.end(text);
          inc(metrics.proxyRequests, `${path.slice(1)}|${proxied.status}`);
        } catch (err) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
          inc(metrics.proxyRequests, `${path.slice(1)}|502`);
        } finally {
          if (timer) clearTimeout(timer);
          metrics.proxyInFlight = Math.max(0, metrics.proxyInFlight - 1);
        }
      });
      return;
    }
    const path = (req.url || "/").split("?")[0];
    if (path === metricsPath) {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      res.end(formatMetrics());
      return;
    }
    // Status endpoint
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", thresholdSeconds: warnThreshold, state }, null, 2));
  });
  server.listen(listenPort, () => log("info", `clock-sync listening on ${listenPort}`));
}

async function init() {
  try {
    await loadVaultEnv();
    rpcL1 = await resolveRpc("L1", process.env.CLOCK_SYNC_RPC_L1);
    rpcL2 = await resolveRpc("L2", process.env.CLOCK_SYNC_RPC_L2);
    rpcL3 = await resolveRpc("L3", process.env.CLOCK_SYNC_RPC_L3);
    chains = [
      { name: "ghostchain", rpc: rpcL1 },
      { name: "ghost-l2", rpc: rpcL2 },
      { name: "ghost-l3", rpc: rpcL3 }
    ];
    startServer();
    await loop();
  } catch (err) {
    log("error", `fatal: ${err?.stack || err}`);
    process.exit(1);
  }
}

init();
