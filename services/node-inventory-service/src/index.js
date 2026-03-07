import express from "express";

const PORT = Number(process.env.PORT || 7622);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
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
app.use(express.json({ limit: "256kb" }));
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
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const _tp = req.headers["traceparent"] ?? `00-${crypto.randomUUID().replace(/-/g,"")}-${req.id.replace(/-/g,"").slice(0,16)}-01`;
  res.setHeader("X-Trace-ID", _tp);
  const _spanId = crypto.randomUUID().replace(/-/g,"").slice(0,16);
  res.setHeader("X-Span-ID", _spanId);
  const _sfs = req.headers["sec-fetch-site"];
  if (_sfs && _sfs !== "same-origin" && _sfs !== "same-site" && _sfs !== "none" && !["GET","HEAD","OPTIONS"].includes(req.method)) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "sec_fetch_cross_site", method: req.method, url: req.url, sfs: _sfs, reqId: req.id }));
  }
  const t0 = process.hrtime.bigint();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2)}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: "node-inventory-service", msg, ...extra }));

const fetchJSON = async (url, timeout = 5000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};

const promQueryRange = async (query) => {
  try {
    const data = await fetchJSON(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    return data?.data?.result ?? [];
  } catch {
    return [];
  }
};

/** Build node records from Prometheus up/version metrics; falls back to seed list. */
const getNodes = async () => {
  // Try to discover nodes from Prometheus scrape targets reporting ghost_node_info
  const nodeInfoResults = await promQueryRange('ghost_node_info');
  if (nodeInfoResults.length > 0) {
    return nodeInfoResults.map((r) => ({
      id: r.metric?.node_id ?? r.metric?.instance ?? r.metric?.job,
      type: r.metric?.node_type ?? "validator",
      host: r.metric?.instance ?? r.metric?.node_id,
      version: r.metric?.version ?? "unknown",
      status: Number(r.value?.[1]) === 1 ? "live" : "degraded",
      layer: r.metric?.layer ?? "l2",
      lastSeenAt: new Date().toISOString(),
    }));
  }

  // Fallback to environment-configured node list (comma-separated JSON array)
  const envNodes = process.env.STATIC_NODES;
  if (envNodes) {
    try {
      return JSON.parse(envNodes);
    } catch {
      log("warn", "STATIC_NODES is not valid JSON, using seed nodes");
    }
  }

  // Seed inventory — useful for dev/testnet
  return [
    { id: "l2-validator-0", type: "validator", host: process.env.L2_HOST || "ghostl2", version: process.env.L2_VERSION || "1.3.2", status: "live", layer: "l2", lastSeenAt: new Date().toISOString() },
    { id: "l2-validator-1", type: "validator", host: process.env.L2_HOST || "ghostl2", version: process.env.L2_VERSION || "1.3.2", status: "live", layer: "l2", lastSeenAt: new Date().toISOString() },
    { id: "l3-validator-0", type: "validator", host: process.env.L3_HOST || "ghostl3", version: process.env.L3_VERSION || "1.3.2", status: "live", layer: "l3", lastSeenAt: new Date().toISOString() },
  ];
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "node-inventory-service" }));

app.get("/nodes", async (_req, res) => {
  const nodes = await getNodes();
  res.json({ ok: true, nodes, fetchedAt: new Date().toISOString() });
});

/** GET /nodes/stats — aggregate counts by layer, type, and status */
app.get("/nodes/stats", async (_req, res) => {
  const nodes = await getNodes();
  const byLayer  = {};
  const byType   = {};
  const byStatus = {};
  for (const n of nodes) {
    const layer  = n.layer  || "unknown";
    const type   = n.type   || "unknown";
    const status = n.status || "unknown";
    byLayer[layer]   = (byLayer[layer]   || 0) + 1;
    byType[type]     = (byType[type]     || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  res.json({
    ok: true,
    total: nodes.length,
    live: byStatus["live"] || 0,
    degraded: (byStatus["degraded"] || 0) + (byStatus["unknown"] || 0),
    byLayer,
    byType,
    byStatus,
    fetchedAt: new Date().toISOString(),
  });
});

app.get("/nodes/:id", async (req, res) => {
  const nodes = await getNodes();
  const node = nodes.find((n) => n.id === req.params.id);
  if (!node) return res.status(404).json({ ok: false, error: "node_not_found" });
  res.json({ ok: true, node });
});

app.get("/nodes/:id/status", async (req, res) => {
  const { id } = req.params;
  try {
    const results = await promQueryRange(`ghost_node_up{node_id="${id}"}`);
    const up = results[0] ? Number(results[0].value?.[1]) === 1 : null;
    res.json({ ok: true, nodeId: id, up, checkedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message });
  }
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

const server = app.listen(PORT, "0.0.0.0", () => log("info", `listening on :${PORT}`, { promUrl: PROM_URL }));
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
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGUSR2", () => {
  const m = process.memoryUsage();
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sigusr2_diag", pid: process.pid, rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external }));
});
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
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
process.on("SIGQUIT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
