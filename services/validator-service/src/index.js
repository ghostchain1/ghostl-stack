import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7600);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
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

const resolveRpc = async (layer) => {
  const registry = await fetchRegistry();
  const chain = registry.chains.find((entry) => entry.layer === layer);
  const rpc = pickRpc(chain);
  if (!rpc) throw new Error(`rpc_missing_${layer.toLowerCase()}`);
  return rpc;
};

const jsonRpc = async (url, method, params = []) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`rpc status ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "rpc error");
    return body.result;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const fetchValidatorsRpc = async (rpc) => {
  if (!rpc) return [];
  const vals = await jsonRpc(rpc, "ibft_getValidatorsByBlockNumber", ["latest"]).catch(() => null);
  if (Array.isArray(vals) && vals.length) return vals;
  const qbftVals = await jsonRpc(rpc, "qbft_getValidatorsByBlockNumber", ["latest"]).catch(() => null);
  return Array.isArray(qbftVals) ? qbftVals : [];
};

const collectProposers = async (rpc, window = 32) => {
  if (!rpc) return { counts: {}, total: 0 };
  const counts = {};
  try {
    const latestHex = await jsonRpc(rpc, "eth_blockNumber");
    const latest = latestHex ? parseInt(latestHex, 16) : 0;
    const start = Math.max(0, latest - window + 1);
    for (let n = start; n <= latest; n++) {
      const blk = await jsonRpc(rpc, "eth_getBlockByNumber", [`0x${n.toString(16)}`, false]);
      const author = blk?.miner || blk?.author;
      if (!author) continue;
      const id = author.toLowerCase();
      counts[id] = (counts[id] || 0) + 1;
    }
    return { counts, total: latest - start + 1 };
  } catch {
    return { counts: {}, total: 0 };
  }
};

const loadFromProm = async () => {
  const queries = {
    stake: "validator_stake_tokens",
    commission: "validator_commission_rate",
    missedBlocks: "validator_missed_blocks_total",
    proposerIndex: "validator_proposer_rank",
    byzantine: "byzantine_alerts_total"
  };
  const metrics = {};
  await Promise.all(
    Object.entries(queries).map(async ([key, q]) => {
      try {
        const resp = await promQuery(q);
        metrics[key] = resp?.data?.result || [];
      } catch {
        metrics[key] = [];
      }
    })
  );
  const map = {};
  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const id = s.metric.validator || s.metric.pubkey || s.metric.address || "unknown";
      if (!map[id]) map[id] = { id };
      map[id][key] = s.value?.[1] || s.value;
    });
  });
  return map;
};

const mergeRpcFallback = async (map) => {
  const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
  const layers = [rpcL2, rpcL3];
  for (const rpc of layers) {
    const vals = await fetchValidatorsRpc(rpc).catch(() => []);
    const proposerStats = await collectProposers(rpc, 32);
    vals.forEach((v, idx) => {
      const id = String(v).toLowerCase();
      if (!map[id]) map[id] = { id };
      map[id].proposerIndex = map[id].proposerIndex ?? idx;
      if (proposerStats.counts && proposerStats.counts[id] !== undefined) {
        map[id].proposerIndex = `${proposerStats.counts[id]}/${proposerStats.total || "?"}`;
      }
      map[id].stake = map[id].stake ?? "0";
      map[id].commission = map[id].commission ?? "0";
      map[id].byzantine = map[id].byzantine ?? "0";
      map[id].missedBlocks = map[id].missedBlocks ?? "?";
    });
  }
  return map;
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "validator-service" });
});

app.get("/validators", async (_req, res) => {
  try {
    let map = await loadFromProm();
    map = await mergeRpcFallback(map);
    const validators = Object.values(map).map((v) => {
      const stakeNum = Number(v.stake || 0);
      return {
        id: v.id,
        address: v.id,
        status: "active",
        stake: v.stake ?? "0",
        commission: v.commission ?? "0",
        power: Number.isFinite(stakeNum) ? stakeNum : 0,
        proposerIndex: v.proposerIndex ?? "?",
        missedBlocks: v.missedBlocks ?? "?",
        byzantine: v.byzantine ?? "0"
      };
    });
    res.json({ ok: true, validators });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[validator-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
