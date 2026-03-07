import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";

import {
  getEvidencePack,
  getProposal,
  getRankedStrategies,
  insertProposal,
  listProposals,
  openDb,
  replaceRankedStrategies,
  upsertEvidencePack
} from "./db.js";
import { buildRankedStrategies } from "./ranking.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || "7685");
const HOST = process.env.HOST || "0.0.0.0";
const DB_PATH = process.env.DB_PATH || "/data/hyper-ghost-governor.sqlite";
const ARTIFACTS_ROOT = process.env.ARTIFACTS_ROOT || "/artifacts/governor";
const GOVERNOR_ADMIN_TOKEN = String(process.env.GOVERNOR_ADMIN_TOKEN || "").trim();
const TREASURY_STATUS_URL = String(process.env.TREASURY_STATUS_URL || "http://treasury-engine:7683/v1/treasury/status").trim();
const REQUEST_TIMEOUT_MS = Math.max(500, Number(process.env.REQUEST_TIMEOUT_MS || "4500"));

const db = openDb({ dbPath: DB_PATH, migrationPath: path.join(__dirname, "..", "migrations", "0001_init.sql") });
fs.mkdirSync(ARTIFACTS_ROOT, { recursive: true });

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
app.use(express.json({ limit: "2mb", reviver: _safeReviver }));
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
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


const metrics = {
  draftedTotal: 0,
  rankLatencyMs: 0,
  policyViolationTotal: 0
};

const log = (level, message, extra = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "hyper-ghost-governor",
      message,
      ...extra
    })
  );
};

const withAdmin = (req, res, next) => {
  if (!GOVERNOR_ADMIN_TOKEN) return next();
  const token = String(req.header("x-admin-token") || "").trim();
  if (!token || token !== GOVERNOR_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
};

const fetchTreasurySnapshot = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TREASURY_STATUS_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`treasury_status_http_${response.status}`);
    const body = await response.json();
    const treasury = body?.treasury || {};
    return {
      totalValueWei: String(treasury.totalValueWei || "0"),
      deployedCapitalWei: String(treasury.deployedCapitalWei || "0"),
      availableWei: String(treasury.availableWei || "0"),
      riskExposureBps: Number(treasury.riskExposureBps || 0)
    };
  } finally {
    clearTimeout(timeout);
  }
};

const writeEvidenceBundle = ({ proposalId, payload }) => {
  const bundlePath = path.join(ARTIFACTS_ROOT, proposalId);
  fs.mkdirSync(bundlePath, { recursive: true });

  const files = [
    { name: "snapshot.json", data: payload.snapshot },
    { name: "ranking.json", data: payload.ranking },
    { name: "summary.json", data: payload.summary },
    { name: "execution-plan.json", data: payload.executionPlan }
  ];

  const written = [];
  for (const file of files) {
    const filePath = path.join(bundlePath, file.name);
    fs.writeFileSync(filePath, JSON.stringify(file.data, null, 2));
    written.push(filePath);
  }

  const markdown = [
    `# Hyper Ghost Governor Evidence Pack`,
    ``,
    `- proposal_id: ${proposalId}`,
    `- generated_at: ${new Date().toISOString()}`,
    `- strategy_count: ${payload.summary.strategyCount}`,
    `- policy_violations: ${payload.summary.violations}`,
    `- top_strategy: ${payload.summary.topStrategyId || "none"}`,
    ``,
    `## Files`,
    ...written.map((filePath) => `- ${filePath}`)
  ].join("\n");

  const summaryPath = path.join(bundlePath, "README.md");
  fs.writeFileSync(summaryPath, markdown);
  written.push(summaryPath);

  return { bundlePath, files: written };
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "hyper-ghost-governor",
    artifactsRoot: ARTIFACTS_ROOT
  });
});

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(
    [
      "# HELP hg_proposals_drafted_total Total drafted treasury governance proposals",
      "# TYPE hg_proposals_drafted_total counter",
      `hg_proposals_drafted_total ${metrics.draftedTotal}`,
      "# HELP hg_strategy_rank_latency_ms Last deterministic strategy ranking latency",
      "# TYPE hg_strategy_rank_latency_ms gauge",
      `hg_strategy_rank_latency_ms ${metrics.rankLatencyMs}`,
      "# HELP hg_policy_violation_total Total strategy policy violations detected",
      "# TYPE hg_policy_violation_total counter",
      `hg_policy_violation_total ${metrics.policyViolationTotal}`
    ].join("\n")
  );
});

app.get("/proposals", (_req, res) => {
  res.json({ ok: true, proposals: listProposals(db, 200) });
});

app.post("/proposals/draft", withAdmin, async (req, res) => {
  const startedAt = Date.now();
  try {
    const proposalId = String(req.body?.proposalId || `hg-${crypto.randomUUID()}`).trim();
    const treasurySnapshot = req.body?.treasurySnapshot || (await fetchTreasurySnapshot());
    const volatilityBand = String(req.body?.volatilityBand || "medium");
    const riskCapBps = Number(req.body?.riskCapBps || 7200);
    const maxProtocolConcentrationBps = Number(req.body?.maxProtocolConcentrationBps || 4500);
    const policyVersion = String(req.body?.policyVersion || "federation-v1");

    const ranking = buildRankedStrategies({
      treasury: treasurySnapshot,
      volatilityBand,
      riskCapBps,
      maxProtocolConcentrationBps,
      policyVersion
    });

    const violationCount = ranking.strategies.reduce((sum, strategy) => sum + strategy.policyViolations.length, 0);
    metrics.policyViolationTotal += violationCount;

    const executionPlan = {
      governanceRequired: true,
      timelockRequired: true,
      humanSignoffRequired: true,
      executionMode: "proposal_only",
      note: "AI governor can only draft; treasury execution must be performed by governance executor."
    };

    const evidence = writeEvidenceBundle({
      proposalId,
      payload: {
        snapshot: treasurySnapshot,
        ranking: ranking.strategies,
        summary: ranking.summary,
        executionPlan
      }
    });

    const createdAt = new Date().toISOString();
    insertProposal(db, {
      proposalId,
      createdAt,
      treasurySnapshot,
      input: {
        volatilityBand,
        riskCapBps,
        maxProtocolConcentrationBps,
        policyVersion,
        source: "hyper-ghost-governor"
      },
      summary: ranking.summary
    });
    replaceRankedStrategies(db, proposalId, ranking.strategies, createdAt);
    upsertEvidencePack(db, {
      proposalId,
      bundlePath: evidence.bundlePath,
      createdAt,
      files: evidence.files
    });

    metrics.draftedTotal += 1;
    metrics.rankLatencyMs = Date.now() - startedAt;

    log("info", "proposal_drafted", {
      proposalId,
      violationCount,
      strategyCount: ranking.strategies.length,
      topStrategy: ranking.summary.topStrategyId,
      latencyMs: metrics.rankLatencyMs
    });

    res.status(201).json({
      ok: true,
      proposalId,
      summary: ranking.summary,
      strategies: ranking.strategies,
      evidence: {
        bundlePath: evidence.bundlePath,
        files: evidence.files
      },
      executionPlan
    });
  } catch (error) {
    metrics.rankLatencyMs = Date.now() - startedAt;
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "proposal_draft_failed"
    });
  }
});

app.get("/proposals/:id/evidence", (req, res) => {
  const proposalId = String(req.params.id || "").trim();
  if (!proposalId) {
    res.status(400).json({ ok: false, error: "proposal_id_required" });
    return;
  }

  const proposal = getProposal(db, proposalId);
  const strategies = getRankedStrategies(db, proposalId);
  const evidence = getEvidencePack(db, proposalId);
  if (!proposal || !evidence) {
    res.status(404).json({ ok: false, error: "proposal_not_found" });
    return;
  }

  res.json({
    ok: true,
    proposal,
    strategies,
    evidence
  });
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

const server = app.listen(PORT, HOST, () => {
  log("info", "service_started", {
    host: HOST,
    port: PORT,
    dbPath: DB_PATH,
    artifactsRoot: ARTIFACTS_ROOT,
    treasuryStatusUrl: TREASURY_STATUS_URL
  });
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
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown", port: PORT, pid: process.pid, boot_ms: Number((process.hrtime.bigint() - _startedAt) / 1_000_000n) }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGUSR2", () => {
  const m = process.memoryUsage(); const cu = process.cpuUsage();
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "sigusr2_diag", pid: process.pid, rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, cpuUser: cu.user, cpuSystem: cu.system, reqTotal: _reqTotal, uptime: process.uptime(), ell: _ellMs }));
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
