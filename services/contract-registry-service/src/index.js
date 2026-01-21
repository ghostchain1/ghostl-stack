import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7608);
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

const fetchContractsProm = async () => {
  const resp = await promQuery("contracts_registry_total");
  const result = resp?.data?.result || [];
  return result.map((r) => ({
    address: r.metric.address || r.metric.contract || "unknown",
    name: r.metric.name || "contract",
    verified: r.metric.verified === "true" || false,
    proxyType: r.metric.proxy || null,
    owner: r.metric.owner || null
  }));
};

const codeAt = async (rpc, addr) => {
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const code = await provider.getCode(addr);
    return code && code !== "0x" ? code : null;
  } catch {
    return null;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "contract-registry-service" }));

app.get("/contracts", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const promContracts = await fetchContractsProm();
    const addrs = promContracts.map((c) => c.address).filter(Boolean).slice(0, 20);
    const codes = await Promise.all(
      addrs.map(async (addr) => ({
        address: addr,
        l2: await codeAt(rpcL2, addr),
        l3: await codeAt(rpcL3, addr)
      }))
    );
    const merged = promContracts.map((c) => {
      const codeInfo = codes.find((x) => x.address?.toLowerCase() === c.address?.toLowerCase());
      return { ...c, hasCodeL2: Boolean(codeInfo?.l2), hasCodeL3: Boolean(codeInfo?.l3) };
    });
    res.json({ ok: true, contracts: merged });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[contract-registry-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
