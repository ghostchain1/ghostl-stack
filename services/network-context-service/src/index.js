import express from "express";
import { ghost } from "ghost";

const PORT              = Number(process.env.PORT || 7633);
const registryUrl       = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries   = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs   = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache     = { data: null, expiresAt: 0 };
const ENV               = process.env.NET_ENV || "dev";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


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
    return { layer, rpc, chainId, block: latest?.number, hash: latest?.hash, timestamp: latest?.timestamp, ts: new Date().toISOString() };
  } catch {
    return { layer, rpc, error: "unreachable", ts: new Date().toISOString() };
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "network-context-service", env: ENV }));

/** GET /context — full network context for all layers */
app.get("/context", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchChain(rpcL2, "L2"), fetchChain(rpcL3, "L3")]);
    res.json({ ok: true, env: ENV, networks: { l2, l3 } });
  } catch (err) {
    res.status(503).json({ ok: false, error: err?.message || String(err) });
  }
});

/** GET /context/summary — high-level overview: both layers, block heights, chain IDs */
app.get("/context/summary", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchChain(rpcL2, "L2"), fetchChain(rpcL3, "L3")]);
    res.json({
      ok: true,
      env: ENV,
      layers: [
        { layer: "L2", chainId: l2.chainId, block: l2.block, error: l2.error ?? null },
        { layer: "L3", chainId: l3.chainId, block: l3.block, error: l3.error ?? null },
      ],
      ts: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: err?.message || String(err) });
  }
});

/** GET /context/stats — registry cache and environment info */
app.get("/context/stats", (_req, res) => {
  const cached = registryCache.data != null && registryCache.expiresAt > Date.now();
  const layers = cached ? (registryCache.data.chains?.map((c) => c.layer) ?? []) : [];
  res.json({ ok: true, stats: { env: ENV, cached, configuredLayers: layers.length, layers, registryUrl, fetchedAt: new Date().toISOString() } });
});

/** GET /context/:layer — context for a single layer (l2 or l3) */
app.get("/context/:layer", async (req, res) => {
  const layer = req.params.layer.toUpperCase();
  if (!["L2", "L3"].includes(layer))
    return res.status(400).json({ ok: false, error: "layer must be l2 or l3" });
  try {
    const rpc  = await resolveRpc(layer);
    const data = await fetchChain(rpc, layer);
    res.json({ ok: true, env: ENV, network: data });
  } catch (err) {
    res.status(503).json({ ok: false, error: err?.message || String(err) });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[network-context-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
