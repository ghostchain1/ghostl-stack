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
process.title = process.env.npm_package_name ?? 'ghoststack';
const _startedAt = process.hrtime.bigint();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.set("case sensitive routing", true);
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
  res.setHeader("Vary", "Accept");
  res.setHeader("Keep-Alive", "timeout=65");
  res.setHeader("X-Robots-Tag", "noindex,nofollow");
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (process.env.REPORT_TO_URL) {
    res.setHeader("Report-To", JSON.stringify({ group: "default", max_age: 86400, endpoints: [{ url: process.env.REPORT_TO_URL }] }));
    res.setHeader("NEL", JSON.stringify({ report_to: "default", max_age: 86400, include_subdomains: false }));
  }
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
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.headers["access-control-request-private-network"] === "true") { res.setHeader("Access-Control-Allow-Private-Network", "true"); }
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
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + _RL_WINDOW) / 1000));
  if (count > _RL_MAX) { res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); res.setHeader("RateLimit-Policy", `limit=${_RL_MAX};w=${Math.ceil(_RL_WINDOW / 1000)}`); return res.status(429).json({ error: "Too many requests" }); }
  next();
});
const _safeReviver = (k, v) => { if (k === "__proto__" || k === "constructor" || k === "prototype") return undefined; return v; };
app.use(express.json({ limit: "256kb", reviver: _safeReviver }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
app.use((req, res, next) => {
  if (["POST","PUT","PATCH"].includes(req.method) && req.headers["content-type"] &&
      !req.is(["application/json","application/x-www-form-urlencoded"])) {
    return res.status(415).json({ ok: false, error: "Unsupported Media Type" });
  }
  next();
});
app.use((req, res, next) => {
  if (req.method !== "OPTIONS" && !req.accepts("application/json")) {
    return res.status(406).json({ ok: false, error: "Not Acceptable" });
  }
  next();
});
const _ALLOWED_HOSTS = new Set((process.env.ALLOWED_HOSTS ?? "").split(",").map(s => s.trim()).filter(Boolean));
app.use((req, res, next) => {
  if (_ALLOWED_HOSTS.size > 0) {
    const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
    if (!_ALLOWED_HOSTS.has(host)) { return res.status(421).json({ ok: false, error: "Misdirected Request" }); }
  }
  next();
});
let _activeReqs = 0;
const _MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_REQUESTS ?? 500);
app.use((req, res, next) => {
  if (_activeReqs >= _MAX_CONCURRENT) { res.setHeader("Retry-After", "1"); return res.status(503).json({ ok: false, error: "server_busy" }); }
  _activeReqs++;
  let _decr = false;
  const _decrActive = () => { if (!_decr) { _decr = true; _activeReqs = Math.max(0, _activeReqs - 1); } };
  res.on("finish", _decrActive);
  res.on("close", _decrActive);
  next();
});
const _idemStore = new Map();
setInterval(() => _idemStore.clear(), 5 * 60_000).unref();
app.use((req, res, next) => {
  const _idemKey = req.headers["idempotency-key"];
  if (_idemKey && req.method === "POST") {
    const _cached = _idemStore.get(_idemKey);
    if (_cached) { res.setHeader("Idempotency-Key", _idemKey); return res.status(_cached.status).json(_cached.body); }
    const _origJson = res.json.bind(res);
    res.json = (body) => { if (res.statusCode < 500) { _idemStore.set(_idemKey, { status: res.statusCode, body }); } return _origJson(body); };
  }
  next();
});
let _reqTotal = 0;
let _ellMs = 0;
(function _pollEll() { const _t = process.hrtime.bigint(); setImmediate(() => { _ellMs = Number(process.hrtime.bigint() - _t) / 1e6; setImmediate(_pollEll); }); })();
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  _reqTotal++;
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const _tp = req.headers["traceparent"] ?? `00-${crypto.randomUUID().replace(/-/g,"")}-${req.id.replace(/-/g,"").slice(0,16)}-01`;
  res.setHeader("X-Trace-ID", _tp);
  const _spanId = crypto.randomUUID().replace(/-/g,"").slice(0,16);
  res.setHeader("X-Span-ID", _spanId);
  const _sfs = req.headers["sec-fetch-site"];
  if (_sfs && _sfs !== "same-origin" && _sfs !== "same-site" && _sfs !== "none" && !["GET","HEAD","OPTIONS"].includes(req.method)) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "sec_fetch_cross_site", method: req.method, url: req.url, sfs: _sfs, sfm: req.headers["sec-fetch-mode"] ?? "", sfd: req.headers["sec-fetch-dest"] ?? "", reqId: req.id }));
  }
  const t0 = process.hrtime.bigint();
  res.on("prefinish", () => { const _ms = (Number(process.hrtime.bigint()-t0)/1e6).toFixed(2); res.setHeader("X-Response-Time", `${_ms}ms`); res.setHeader("Server-Timing", `total;dur=${_ms}`); });
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss, httpVer: req.httpVersion, xff: req.headers["x-forwarded-for"] ?? "" })));
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

app.get("/readyz", (_req, res) => {
  if (_draining) { res.setHeader("Retry-After", "5"); return res.status(503).json({ ok: false, error: "draining" }); }
  res.json({ ok: true });
});
app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("Surrogate-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  if (err.status === 405 || err.statusCode === 405) return res.status(405).json({ ok: false, error: "Method not allowed" });
  const status = err.status ?? err.statusCode ?? 500;
  const _isProd = process.env.NODE_ENV === "production";
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "global-search-service listening", port: PORT }));
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.maxConnections = 1024;
server.on("connection", (socket) => socket.setNoDelay(true));
server.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "serverError", error: err?.message ?? String(err), code: err?.code }));
  if (err.code === "EADDRINUSE" || err.code === "EACCES") { process.exitCode = 1; process.exit(1); }
});
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown", port: PORT, pid: process.pid, boot_ms: Number((process.hrtime.bigint() - _startedAt) / 1_000_000n), env: process.env.NODE_ENV ?? "development" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGUSR2", () => {
  const m = process.memoryUsage(); const cu = process.cpuUsage();
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sigusr2_diag", pid: process.pid, rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, cpuUser: cu.user, cpuSystem: cu.system, reqTotal: _reqTotal, uptime: process.uptime(), ell: _ellMs, handles: process._getActiveHandles().length }));
});
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
process.on("SIGHUP", () => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sighup_reload", pid: process.pid })); });
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err), stack: err?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason), stack: reason?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "shutdown_complete", pid: process.pid })); process.exit(0); });
});
process.on("SIGINT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "shutdown_complete", pid: process.pid })); process.exit(0); });
});
process.on("SIGQUIT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "shutdown_complete", pid: process.pid })); process.exit(0); });
});
