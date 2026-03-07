import express from "express";

const PORT     = Number(process.env.PORT || 7609);
const PROM_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";

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


// Manual risk overrides: address → { level, reason, setAt }
const overrides = new Map();

async function promQuery(q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(
      `${PROM_URL}/api/v1/query?query=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { return []; } finally { clearTimeout(timer); }
}

function toFloat(v) { return parseFloat(v?.[1] ?? "0") || 0; }
function scoreToLevel(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "contract-risk-service", overrideCount: overrides.size }));

/** GET /risk — all contract risk scores from Prometheus, with overrides applied */
app.get("/risk", async (_req, res) => {
  const [riskScores, upgradeFlags, proxyPaused] = await Promise.all([
    promQuery("ghost_contract_risk_score"),
    promQuery("ghost_contract_upgrade_pending"),
    promQuery("ghost_contract_paused"),
  ]);

  const byAddress = {};
  for (const r of riskScores) {
    const addr = r.metric?.contract || r.metric?.address || r.metric?.instance || "unknown";
    const score = Math.round(toFloat(r.value) * 100) / 100;
    byAddress[addr] = { address: addr, score, level: scoreToLevel(score), upgradePending: false, paused: false };
  }
  for (const r of upgradeFlags) {
    const addr = r.metric?.contract || r.metric?.address || "unknown";
    if (byAddress[addr]) byAddress[addr].upgradePending = toFloat(r.value) === 1;
  }
  for (const r of proxyPaused) {
    const addr = r.metric?.contract || r.metric?.address || "unknown";
    if (byAddress[addr]) byAddress[addr].paused = toFloat(r.value) === 1;
  }

  const contracts = Object.values(byAddress).map((c) => {
    const ov = overrides.get(c.address);
    return ov ? { ...c, level: ov.level, overridden: true, overrideReason: ov.reason } : c;
  });

  const { level, minScore, maxScore } = req?.query ?? {};
  let filtered = contracts;
  if (level)    filtered = filtered.filter((c) => c.level === level);
  if (minScore) filtered = filtered.filter((c) => c.score >= Number(minScore));
  if (maxScore) filtered = filtered.filter((c) => c.score <= Number(maxScore));

  res.json({ ok: true, count: filtered.length, contracts: filtered });
});

/** GET /risk/stats — aggregate risk statistics */
app.get("/risk/stats", async (_req, res) => {
  const results = await promQuery("ghost_contract_risk_score");
  const scores  = results.map((r) => toFloat(r.value) * 100);
  const total   = scores.length;
  const highRisk = scores.filter((s) => s >= 60).length;
  const criticalRisk = scores.filter((s) => s >= 80).length;
  const avgScore = total > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / total) * 100) / 100 : 0;
  const maxScore = total > 0 ? Math.max(...scores) : 0;
  res.json({ ok: true, total, highRisk, criticalRisk, avgScore, maxScore, overrideCount: overrides.size, ts: new Date().toISOString() });
});

/** POST /risk/overrides — set or update a manual risk level for an address */
app.post("/risk/overrides", (req, res) => {
  const { address, level, reason } = req.body || {};
  if (!address || !level) return res.status(400).json({ ok: false, error: "address and level are required" });
  const valid = ["low", "medium", "high", "critical"];
  if (!valid.includes(level)) return res.status(400).json({ ok: false, error: `level must be one of: ${valid.join(", ")}` });
  overrides.set(address, { address, level, reason: reason || "", setAt: new Date().toISOString() });
  res.status(201).json({ ok: true, override: overrides.get(address) });
});

/** DELETE /risk/overrides/:address — remove a manual override */
app.delete("/risk/overrides/:address", (req, res) => {
  if (!overrides.has(req.params.address)) return res.status(404).json({ ok: false, error: "not_found" });
  overrides.delete(req.params.address);
  res.json({ ok: true });
});

/** GET /risk/overrides — list all manual overrides */
app.get("/risk/overrides", (_req, res) => {
  res.json({ ok: true, count: overrides.size, overrides: [...overrides.values()] });
});

/** GET /risk/:address — risk for a specific contract address */
app.get("/risk/:address", async (req, res) => {
  const addr = req.params.address;
  const [riskRes, upgradeRes, pausedRes] = await Promise.all([
    promQuery(`ghost_contract_risk_score{contract="${addr}"}`),
    promQuery(`ghost_contract_upgrade_pending{contract="${addr}"}`),
    promQuery(`ghost_contract_paused{contract="${addr}"}`),
  ]);
  const score = riskRes[0] ? Math.round(toFloat(riskRes[0].value) * 100) / 100 : null;
  const ov    = overrides.get(addr);
  res.json({
    ok: true,
    address: addr,
    score,
    level: ov ? ov.level : score != null ? scoreToLevel(score) : null,
    overridden: !!ov,
    overrideReason: ov?.reason ?? null,
    upgradePending: toFloat(upgradeRes[0]?.value) === 1,
    paused: toFloat(pausedRes[0]?.value) === 1,
    ts: new Date().toISOString(),
  });
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
  console.log(`[contract-risk-service] listening on :${PORT}`);
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
