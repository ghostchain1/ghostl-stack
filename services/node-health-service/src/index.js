import express from "express";
import { ghost } from "ghost";

const PORT = Number(process.env.PORT || 7613);
const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };

const app = express();
app.use(express.json());

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
  const registry = await fetchRegistry();
  const chain = registry.chains.find((entry) => entry.layer === layer);
  const rpc = pickRpc(chain);
  if (!rpc) throw new Error(`rpc_missing_${layer.toLowerCase()}`);
  return rpc;
};

const fetchNode = async (rpc) => {
  const provider = new ghost.JsonRpcProvider(rpc);
  const peersHex = await provider.send("net_peerCount", []);
  const syncing = await provider.send("ghost_syncing", []);
  const block = await provider.getBlock("latest");
  return {
    rpc,
    peers: parseInt(peersHex, 16),
    syncing: syncing && typeof syncing === "object",
    block: block?.number,
    lagSeconds: block?.timestamp ? Math.max(0, Math.floor(Date.now() / 1000 - Number(block.timestamp))) : null
  };
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "node-health-service" }));

app.get("/nodes", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchNode(rpcL2), fetchNode(rpcL3)]);
    res.json({ ok: true, nodes: { l2, l3 } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[node-health-service] listening on :${PORT}`);
});
