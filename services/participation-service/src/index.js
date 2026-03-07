import express from "express";

const PORT     = Number(process.env.PORT || 7603);
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
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + _RL_WINDOW) / 1000));
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

async function promRange(q, start, end, step = "60s") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const params = new URLSearchParams({ query: q, start, end, step });
  try {
    const r = await fetch(`${PROM_URL}/api/v1/query_range?${params}`, { signal: controller.signal });
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { return []; } finally { clearTimeout(timer); }
}

function toFloat(v) { return parseFloat(v?.[1] ?? "0") || 0; }

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "participation-service" })
);

/** GET /participation — all validator participation data */
app.get("/participation", async (_req, res) => {
  const [missedRes, proposedRes, byzantineRes] = await Promise.all([
    promQuery("ghost_validator_missed_blocks_total"),
    promQuery("ghost_validator_proposed_blocks_total"),
    promQuery("ghost_validator_byzantine_faults_total"),
  ]);

  const byValidator = {};
  const collect = (results, key) => {
    for (const r of results) {
      const v = r.metric?.validator || r.metric?.instance || "unknown";
      if (!byValidator[v]) byValidator[v] = { validator: v, missed: 0, proposed: 0, byzantine: 0 };
      byValidator[v][key] = toFloat(r.value);
    }
  };
  collect(missedRes,    "missed");
  collect(proposedRes,  "proposed");
  collect(byzantineRes, "byzantine");

  const validators = Object.values(byValidator).map((v) => ({
    ...v,
    participationRate: v.proposed + v.missed > 0
      ? Math.round((v.proposed / (v.proposed + v.missed)) * 10000) / 100
      : null,
  }));

  res.json({ ok: true, count: validators.length, validators });
});

/** GET /participation/stats — aggregate rates */
app.get("/participation/stats", async (_req, res) => {
  const [missedRes, proposedRes, totalRes] = await Promise.all([
    promQuery("sum(ghost_validator_missed_blocks_total)"),
    promQuery("sum(ghost_validator_proposed_blocks_total)"),
    promQuery("count(ghost_validator_proposed_blocks_total)"),
  ]);

  const totalMissed   = toFloat(missedRes[0]?.value);
  const totalProposed = toFloat(proposedRes[0]?.value);
  const validatorCount = toFloat(totalRes[0]?.value);
  const totalBlocks   = totalProposed + totalMissed;
  const overallRate   = totalBlocks > 0 ? Math.round((totalProposed / totalBlocks) * 10000) / 100 : null;

  res.json({
    ok: true,
    validatorCount,
    totalProposed,
    totalMissed,
    overallParticipationRate: overallRate,
    ts: new Date().toISOString(),
  });
});

/** GET /participation/range?validator=X&start=&end=&step= */
app.get("/participation/range", async (req, res) => {
  const { validator, start, end, step = "300s" } = req.query;
  if (!start || !end) return res.status(400).json({ ok: false, error: "start and end required" });
  const labelFilter = validator ? `{validator="${validator}"}` : "";
  const [missedSeries, proposedSeries] = await Promise.all([
    promRange(`ghost_validator_missed_blocks_total${labelFilter}`, start, end, step),
    promRange(`ghost_validator_proposed_blocks_total${labelFilter}`, start, end, step),
  ]);
  res.json({ ok: true, missed: missedSeries, proposed: proposedSeries });
});

/** GET /participation/:validator — individual validator data */
app.get("/participation/:validator", async (req, res) => {
  const v = req.params.validator;
  const label = `validator="${v}"`;
  const [missedRes, proposedRes, byzantineRes] = await Promise.all([
    promQuery(`ghost_validator_missed_blocks_total{${label}}`),
    promQuery(`ghost_validator_proposed_blocks_total{${label}}`),
    promQuery(`ghost_validator_byzantine_faults_total{${label}}`),
  ]);
  const missed    = toFloat(missedRes[0]?.value);
  const proposed  = toFloat(proposedRes[0]?.value);
  const byzantine = toFloat(byzantineRes[0]?.value);
  const total = proposed + missed;
  res.json({
    ok: true,
    validator: v,
    proposed,
    missed,
    byzantine,
    participationRate: total > 0 ? Math.round((proposed / total) * 10000) / 100 : null,
    ts: new Date().toISOString(),
  });
});

app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[participation-service] listening on :${PORT}`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.on("connection", (socket) => socket.setNoDelay(true));
server.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "serverError", error: err?.message ?? String(err), code: err?.code }));
  if (err.code === "EADDRINUSE" || err.code === "EACCES") { process.exitCode = 1; process.exit(1); }
});
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err) }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason) }));
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
