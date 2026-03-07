import express from "express";

const PORT = Number(process.env.PORT || 7637);
const TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 4000);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJSON(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCall(rpcUrl, method, params) {
  return fetchJSON(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

// ---------------------------------------------------------------------------
// Result normalisation
// ---------------------------------------------------------------------------

function makeResult({ type, id, title, snippet, url, score }) {
  return { type, id, title, snippet: snippet ?? "", url: url ?? null, score: score ?? 0.5 };
}

// ---------------------------------------------------------------------------
// Source adapters
// ---------------------------------------------------------------------------

async function searchChain({ q, rpcUrl, chain }) {
  const results = [];
  const qTrim = q.trim();

  if (/^0x[0-9a-fA-F]{64}$/.test(qTrim)) {
    // Transaction hash
    const tx = await rpcCall(rpcUrl, "eth_getTransactionByHash", [qTrim]);
    if (tx?.result) {
      const t = tx.result;
      results.push(makeResult({
        type: `${chain}:transaction`,
        id: qTrim,
        title: `Transaction ${qTrim.slice(0, 18)}… on ${chain.toUpperCase()}`,
        snippet: `From: ${t.from} | Block: ${Number(t.blockNumber ?? 0)} | Value: ${t.value}`,
        score: 1.0,
      }));
    }
    // Block hash
    const blk = await rpcCall(rpcUrl, "eth_getBlockByHash", [qTrim, false]);
    if (blk?.result) {
      const b = blk.result;
      results.push(makeResult({
        type: `${chain}:block`,
        id: qTrim,
        title: `Block ${Number(b.number)} on ${chain.toUpperCase()}`,
        snippet: `Hash: ${qTrim} | Txns: ${b.transactions?.length ?? 0} | Timestamp: ${Number(b.timestamp)}`,
        score: 0.95,
      }));
    }
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(qTrim)) {
    // Address / contract
    const [bal, code] = await Promise.all([
      rpcCall(rpcUrl, "eth_getBalance", [qTrim, "latest"]),
      rpcCall(rpcUrl, "eth_getCode", [qTrim, "latest"]),
    ]);
    if (bal?.result !== undefined) {
      const balWei = BigInt(bal.result ?? "0x0");
      const isContract = code?.result && code.result !== "0x";
      results.push(makeResult({
        type: `${chain}:${isContract ? "contract" : "address"}`,
        id: qTrim,
        title: `${isContract ? "Contract" : "Address"} ${qTrim.slice(0, 10)}… on ${chain.toUpperCase()}`,
        snippet: `Balance: ${(Number(balWei) / 1e18).toFixed(6)} ETH`,
        score: 0.9,
      }));
    }
  }

  if (/^\d+$/.test(qTrim)) {
    // Block number
    const blk = await rpcCall(rpcUrl, "eth_getBlockByNumber", [`0x${Number(qTrim).toString(16)}`, false]);
    if (blk?.result) {
      const b = blk.result;
      results.push(makeResult({
        type: `${chain}:block`,
        id: b.hash ?? qTrim,
        title: `Block ${qTrim} on ${chain.toUpperCase()}`,
        snippet: `Hash: ${b.hash ?? "–"} | Txns: ${b.transactions?.length ?? 0}`,
        score: 0.85,
      }));
    }
  }

  return results;
}

async function searchGovernance({ q, govUrl }) {
  const results = [];
  // Try two common path shapes; whichever doesn't 404 wins
  for (const url of [
    `${govUrl}/v1/proposals?q=${encodeURIComponent(q)}&limit=10`,
    `${govUrl}/proposals?q=${encodeURIComponent(q)}&limit=10`,
  ]) {
    const data = await fetchJSON(url);
    if (!data) continue;
    const proposals = Array.isArray(data) ? data : (data.proposals ?? data.items ?? []);
    for (const p of proposals.slice(0, 10)) {
      results.push(makeResult({
        type: "governance:proposal",
        id: String(p.id ?? p.proposalId ?? ""),
        title: p.title ?? p.description?.slice(0, 80) ?? "Governance Proposal",
        snippet: p.description?.slice(0, 200) ?? "",
        score: 0.7,
      }));
    }
    if (results.length > 0) break;
  }
  return results;
}

async function searchRpcRegistry({ q, registryUrl }) {
  const results = [];
  const data = await fetchJSON(registryUrl);
  if (!data) return results;
  const endpoints = Array.isArray(data) ? data : (data.endpoints ?? data.items ?? []);
  const ql = q.toLowerCase();
  for (const ep of endpoints) {
    const name = String(ep.name ?? ep.id ?? "");
    const url = String(ep.url ?? ep.endpoint ?? "");
    const chain = String(ep.chain ?? ep.network ?? "");
    if ([name, chain, url].some(s => s.toLowerCase().includes(ql))) {
      results.push(makeResult({
        type: "rpc:endpoint",
        id: name || url,
        title: `RPC endpoint: ${name || url}`,
        snippet: `Chain: ${chain} | URL: ${url}`,
        score: 0.6,
      }));
    }
  }
  return results.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
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
  if (count > _RL_MAX) return res.status(429).json({ error: "Too many requests" });
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id })));
  next();
});


app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "global-search-service" }),
);

app.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const requestedTypes = req.query.types
    ? String(req.query.types).split(",").map(t => t.trim()).filter(Boolean)
    : null;

  if (!q) {
    return res.status(400).json({ ok: false, error: "Missing required query parameter: q" });
  }

  const t0 = Date.now();
  const searches = [];

  // Chain sources — GHOST_L{1,2,3}_RPC_URLS are comma-separated; take first URL
  for (const { name, envVar } of [
    { name: "l1", envVar: "GHOST_L1_RPC_URLS" },
    { name: "l2", envVar: "GHOST_L2_RPC_URLS" },
    { name: "l3", envVar: "GHOST_L3_RPC_URLS" },
  ]) {
    const rpcUrl = (process.env[envVar] ?? "").split(",")[0].trim();
    if (!rpcUrl) continue;
    if (requestedTypes && !requestedTypes.some(t => t.startsWith(name))) continue;
    searches.push(searchChain({ q, rpcUrl, chain: name }));
  }

  // Governance service
  const govUrl = (process.env.HYPER_GHOST_GOVERNOR_URL ?? "").trim();
  if (govUrl && (!requestedTypes || requestedTypes.includes("governance"))) {
    searches.push(searchGovernance({ q, govUrl }));
  }

  // RPC endpoint registry
  const registryUrl = (process.env.RPC_REGISTRY_URL ?? "").trim();
  if (registryUrl && (!requestedTypes || requestedTypes.includes("rpc"))) {
    searches.push(searchRpcRegistry({ q, registryUrl }));
  }

  const settled = await Promise.allSettled(searches);
  const allResults = settled
    .filter(s => s.status === "fulfilled")
    .flatMap(s => s.value);

  // Deduplicate by type::id, sort by score descending
  const seen = new Set();
  const matches = [];
  for (const r of allResults.sort((a, b) => b.score - a.score)) {
    const key = `${r.type}::${r.id}`;
    if (!seen.has(key)) { seen.add(key); matches.push(r); }
  }

  res.json({
    ok: true,
    query: q,
    matches: matches.slice(0, limit),
    total: matches.length,
    took_ms: Date.now() - t0,
  });
});

/** GET /search/types — list configured search source types */
app.get("/search/types", (_req, res) => {
  const types = [];
  for (const { name, envVar } of [
    { name: "l1", envVar: "GHOST_L1_RPC_URLS" },
    { name: "l2", envVar: "GHOST_L2_RPC_URLS" },
    { name: "l3", envVar: "GHOST_L3_RPC_URLS" },
  ]) {
    if ((process.env[envVar] ?? "").trim()) {
      types.push({ type: name, kinds: [`${name}:transaction`, `${name}:block`, `${name}:address`, `${name}:contract`], configured: true });
    }
  }
  if ((process.env.HYPER_GHOST_GOVERNOR_URL ?? "").trim())
    types.push({ type: "governance", kinds: ["governance:proposal"], configured: true });
  if ((process.env.RPC_REGISTRY_URL ?? "").trim())
    types.push({ type: "rpc", kinds: ["rpc:endpoint"], configured: true });
  res.json({ ok: true, types });
});

/** GET /search/stats — configured search source summary */
app.get("/search/stats", (_req, res) => {
  const chains = ["GHOST_L1_RPC_URLS", "GHOST_L2_RPC_URLS", "GHOST_L3_RPC_URLS"].filter(e => (process.env[e] ?? "").trim()).length;
  const hasGovernance = !!(process.env.HYPER_GHOST_GOVERNOR_URL ?? "").trim();
  const hasRegistry = !!(process.env.RPC_REGISTRY_URL ?? "").trim();
  res.json({ ok: true, stats: { configuredChains: chains, governanceSource: hasGovernance, rpcRegistrySource: hasRegistry, totalSources: chains + (hasGovernance ? 1 : 0) + (hasRegistry ? 1 : 0), fetchedAt: new Date().toISOString() } });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
  process.exit(1);
});
process.on("SIGTERM", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.close(() => process.exit(0));
});
