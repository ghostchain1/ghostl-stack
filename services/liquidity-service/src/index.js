import express from "express";
import { ghost } from "ghost";

const PORT = Number(process.env.PORT || 7606);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache = { data: null, expiresAt: 0 };
const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS || "";
const L2_TOKEN = process.env.L2_TOKEN_ADDRESS || "";
const L3_TOKEN = process.env.L3_TOKEN_ADDRESS || "";

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: controller.signal });
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

const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];

const erc20Balance = async (rpcUrl, token, account) => {
  if (!token || !account) return null;
  try {
    const provider = new ghost.JsonRpcProvider(rpcUrl);
    const c = new ghost.Contract(token, erc20Abi, provider);
    const bal = await c.balanceOf(account);
    return bal.toString();
  } catch {
    return null;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "liquidity-service" }));

app.get("/liquidity", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const relayedResp = await promQuery("ghost_relayer_relayed_to_l3_total");
    const releasedResp = await promQuery("ghost_relayer_released_to_l2_total");
    const relayed = relayedResp?.data?.result?.[0]?.value?.[1] || "0";
    const released = releasedResp?.data?.result?.[0]?.value?.[1] || "0";

    const l2TokenBal = await erc20Balance(rpcL2, L2_TOKEN, BRIDGE_ADDRESS);
    const l3TokenSupply = await erc20Balance(rpcL3, L3_TOKEN, null);

    res.json({
      ok: true,
      pools: [
        { id: "l2-bridge", chain: "l2", token: L2_TOKEN, bridge: BRIDGE_ADDRESS, balance: l2TokenBal },
        { id: "l3-token", chain: "l3", token: L3_TOKEN, supply: l3TokenSupply }
      ],
      stats: { relayed, released }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[liquidity-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
