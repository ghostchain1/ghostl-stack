#!/usr/bin/env node
import http from "http";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };

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
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
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
    log("error", `${name} rpc error: ${state[name].error}`);
  }
}

function log(level, msg) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`${ts} [${level}] ${msg}`);
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
      // Middleware proxy: POST /l1, /l2, or /l3 forwards JSON-RPC to the corresponding chain
      const target =
        req.url === "/l1" ? rpcL1 : req.url === "/l2" ? rpcL2 : req.url === "/l3" ? rpcL3 : null;
      if (!target) {
        res.writeHead(404);
        return res.end();
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const proxied = await fetch(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body
          });
          const text = await proxied.text();
          res.writeHead(proxied.status, { "content-type": proxied.headers.get("content-type") || "application/json" });
          res.end(text);
        } catch (err) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
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
