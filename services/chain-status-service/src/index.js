import express from "express";
import { ghost } from "ghost";

const PORT              = Number(process.env.PORT || 7612);
const registryUrl       = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries   = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs   = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache     = { data: null, expiresAt: 0 };

const app = express();
app.use(express.json({ limit: "256kb" }));

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
    } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error("registry_unavailable");
};

const pickRpc = (chain) => {
  if (!chain) return "";
  if (typeof chain.rpc === "string" && chain.rpc) return chain.rpc;
  if (Array.isArray(chain.rpcUrls) && chain.rpcUrls.length) return chain.rpcUrls[0];
  if (Array.isArray(chain.endpoints)) {
    const http = chain.endpoints.find((e) => e.protocol === "http");
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

const fetchChain = async (rpc, layer) => {
  try {
    const provider = new ghost.JsonRpcProvider(rpc);
    const [chainId, latest] = await Promise.all([
      provider.send("ghost_chainId", []),
      provider.getBlock("latest"),
    ]);
    let blockTime = null;
    if (latest?.number > 0) {
      try {
        const prev = await provider.getBlock(latest.number - 1);
        blockTime = prev ? Math.max(0, Number(latest.timestamp) - Number(prev.timestamp)) : null;
      } catch { /* non-fatal */ }
    }
    return {
      layer,
      rpc,
      chainId,
      block: latest?.number,
      hash: latest?.hash,
      blockTime,
      timestamp: latest?.timestamp,
      lagSeconds: latest?.timestamp
        ? Math.max(0, Math.floor(Date.now() / 1000 - Number(latest.timestamp)))
        : null,
      ts: new Date().toISOString(),
    };
  } catch (e) {
    return { layer, rpc, error: e?.message || "unreachable", ts: new Date().toISOString() };
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "chain-status-service" }));

/** GET /chains — status for all layers */
app.get("/chains", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchChain(rpcL2, "L2"), fetchChain(rpcL3, "L3")]);
    res.json({ ok: true, chains: { l2, l3 } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /chains/summary — concise multi-layer overview */
app.get("/chains/summary", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchChain(rpcL2, "L2"), fetchChain(rpcL3, "L3")]);
    const chains = [l2, l3];
    res.json({
      ok: true,
      chains: chains.map((c) => ({
        layer: c.layer,
        chainId: c.chainId,
        block: c.block,
        blockTimeSec: c.blockTime,
        lagSeconds: c.lagSeconds,
        healthy: !c.error,
      })),
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /chains/stats — aggregate health metrics across all layers */
app.get("/chains/stats", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchChain(rpcL2, "L2"), fetchChain(rpcL3, "L3")]);
    const chains = [l2, l3];
    const healthy = chains.filter((c) => !c.error).length;
    const lags = chains.filter((c) => c.lagSeconds != null).map((c) => c.lagSeconds);
    const blockTimes = chains.filter((c) => c.blockTime != null).map((c) => c.blockTime);
    const avgLag = lags.length ? Math.round(lags.reduce((a, b) => a + b, 0) / lags.length) : null;
    const avgBlockTime = blockTimes.length ? Math.round((blockTimes.reduce((a, b) => a + b, 0) / blockTimes.length) * 10) / 10 : null;
    res.json({ ok: true, total: chains.length, healthy, degraded: chains.length - healthy, avgLagSeconds: avgLag, avgBlockTimeSec: avgBlockTime, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /chains/:layer — status for a single layer (l2 or l3) */
app.get("/chains/:layer", async (req, res) => {
  const layer = req.params.layer.toUpperCase();
  if (!["L2", "L3"].includes(layer))
    return res.status(400).json({ ok: false, error: "layer must be l2 or l3" });
  try {
    const rpc  = await resolveRpc(layer);
    const data = await fetchChain(rpc, layer);
    res.json({ ok: true, chain: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[chain-status-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
