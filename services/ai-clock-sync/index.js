#!/usr/bin/env node
import http from "http";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const rpcL1 = process.env.CLOCK_SYNC_RPC_L1 || process.env.RPC_L1 || "http://host.docker.internal:18545";
const rpcL2 = process.env.CLOCK_SYNC_RPC_L2 || process.env.RPC_L2 || "http://host.docker.internal:29547";
const rpcL3 = process.env.CLOCK_SYNC_RPC_L3 || process.env.RPC_L3 || "http://host.docker.internal:39545";
const pollMs = Number(process.env.CLOCK_SYNC_INTERVAL_MS || 5000);
const warnThreshold = Number(process.env.CLOCK_SYNC_DRIFT_THRESHOLD_SEC || 2);
const listenPort = Number(process.env.PORT || 7690);

const chains = [
  { name: "ghostchain", rpc: rpcL1 },
  { name: "ghost-l2", rpc: rpcL2 },
  { name: "ghost-l3", rpc: rpcL3 }
];

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

startServer();
loop().catch((err) => {
  log("error", `fatal: ${err?.stack || err}`);
  process.exit(1);
});
