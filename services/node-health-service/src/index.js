import express from "express";
import { ghost } from "ghost";

const PORT              = Number(process.env.PORT || 7613);
const registryUrl       = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || 1500);
const registryRetries   = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || 2));
const registryCacheMs   = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || 30000));
const registryCache     = { data: null, expiresAt: 0 };

const app = express();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.removeHeader("X-Powered-By");
  next();
});
const _CORS_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && _CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
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

const fetchNode = async (rpc, layer) => {
  try {
    const provider = new ghost.JsonRpcProvider(rpc);
    const [peersHex, syncing, block] = await Promise.all([
      provider.send("net_peerCount", []),
      provider.send("ghost_syncing", []),
      provider.getBlock("latest"),
    ]);
    const peers = parseInt(peersHex, 16);
    const isSyncing = syncing && typeof syncing === "object";
    const lagSeconds = block?.timestamp
      ? Math.max(0, Math.floor(Date.now() / 1000 - Number(block.timestamp)))
      : null;
    const status = isSyncing ? "syncing" : lagSeconds != null && lagSeconds > 30 ? "lagging" : "live";
    return { layer, rpc, peers, syncing: isSyncing, block: block?.number, lagSeconds, status, ts: new Date().toISOString() };
  } catch (e) {
    return { layer, rpc, peers: null, syncing: null, block: null, lagSeconds: null, status: "unreachable", error: e?.message, ts: new Date().toISOString() };
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "node-health-service" }));

/** GET /nodes — all layers */
app.get("/nodes", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchNode(rpcL2, "L2"), fetchNode(rpcL3, "L3")]);
    res.json({ ok: true, nodes: { l2, l3 } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /nodes/summary — aggregated status overview */
app.get("/nodes/summary", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchNode(rpcL2, "L2"), fetchNode(rpcL3, "L3")]);
    const nodes = [l2, l3];
    const live  = nodes.filter((n) => n.status === "live").length;
    const degraded = nodes.length - live;
    res.json({
      ok: true,
      totalNodes: nodes.length,
      liveNodes: live,
      degradedNodes: degraded,
      allHealthy: degraded === 0,
      nodes: nodes.map((n) => ({ layer: n.layer, status: n.status, block: n.block, lagSeconds: n.lagSeconds })),
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /nodes/stats — aggregate health metrics across all layers */
app.get("/nodes/stats", async (_req, res) => {
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const [l2, l3] = await Promise.all([fetchNode(rpcL2, "L2"), fetchNode(rpcL3, "L3")]);
    const nodes = [l2, l3];
    const byStatus = {};
    for (const n of nodes) byStatus[n.status] = (byStatus[n.status] || 0) + 1;
    const lags = nodes.filter((n) => n.lagSeconds != null).map((n) => n.lagSeconds);
    const peerCounts = nodes.filter((n) => n.peers != null).map((n) => n.peers);
    const avgLag = lags.length ? Math.round(lags.reduce((a, b) => a + b, 0) / lags.length) : null;
    const avgPeers = peerCounts.length ? Math.round(peerCounts.reduce((a, b) => a + b, 0) / peerCounts.length) : null;
    res.json({ ok: true, total: nodes.length, byStatus, avgLagSeconds: avgLag, avgPeers, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** GET /nodes/:layer — single layer node health (l2 or l3) */
app.get("/nodes/:layer", async (req, res) => {
  const layer = req.params.layer.toUpperCase();
  if (!["L2", "L3"].includes(layer))
    return res.status(400).json({ ok: false, error: "layer must be l2 or l3" });
  try {
    const rpc  = await resolveRpc(layer);
    const data = await fetchNode(rpc, layer);
    res.json({ ok: true, node: data });
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
  console.log(`[node-health-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
