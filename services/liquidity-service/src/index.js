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
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
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
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const _RL_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const _RL_MAX    = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const _rlStore   = new Map();
setInterval(() => _rlStore.clear(), _RL_WINDOW).unref();
app.use((req, res, next) => {
  const key = req.ip ?? "unknown";
  const count = (_rlStore.get(key) ?? 0) + 1;
  _rlStore.set(key, count);
  res.setHeader("X-RateLimit-Limit", _RL_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, _RL_MAX - count));
  if (count > _RL_MAX) { res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); res.setHeader("RateLimit-Policy", `limit=${_RL_MAX};w=${Math.ceil(_RL_WINDOW / 1000)}`); return res.status(429).json({ error: "Too many requests" }); }
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${Date.now() - t0}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


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

/** GET /liquidity/stats — aggregate relayer flow totals and net balance */
app.get("/liquidity/stats", async (_req, res) => {
  try {
    const relayedResp = await promQuery("ghost_relayer_relayed_to_l3_total");
    const releasedResp = await promQuery("ghost_relayer_released_to_l2_total");
    const relayed = relayedResp?.data?.result?.[0]?.value?.[1] || "0";
    const released = releasedResp?.data?.result?.[0]?.value?.[1] || "0";
    let netFlow = "0";
    try { netFlow = (BigInt(relayed) - BigInt(released)).toString(); } catch { /* non-numeric prom value */ }
    res.json({ ok: true, stats: { relayedToL3: relayed, releasedToL2: released, netFlow, fetchedAt: new Date().toISOString() } });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /liquidity/:pool — info for a single named pool (l2-bridge, l3-token) */
app.get("/liquidity/:pool", async (req, res) => {
  const { pool } = req.params;
  try {
    const [rpcL2, rpcL3] = await Promise.all([resolveRpc("L2"), resolveRpc("L3")]);
    const l2TokenBal = await erc20Balance(rpcL2, L2_TOKEN, BRIDGE_ADDRESS);
    const l3TokenSupply = await erc20Balance(rpcL3, L3_TOKEN, null);
    const pools = {
      "l2-bridge": { id: "l2-bridge", chain: "l2", token: L2_TOKEN, bridge: BRIDGE_ADDRESS, balance: l2TokenBal },
      "l3-token": { id: "l3-token", chain: "l3", token: L3_TOKEN, supply: l3TokenSupply },
    };
    if (!pools[pool]) {
      res.status(404).json({ ok: false, error: "pool_not_found", validPools: Object.keys(pools) });
      return;
    }
    res.json({ ok: true, pool: pools[pool] });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});


app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[liquidity-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
