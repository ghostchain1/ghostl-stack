import express from "express";
import { ghost } from "ghost";

const PORT = Number(process.env.PORT || 7630);
const SIGNER_KEY = process.env.TREASURY_AI_SIGNER_KEY || "";
const MODEL_VERSION = Number(process.env.TREASURY_AI_MODEL_VERSION || 1);
const MODEL_CARD = process.env.TREASURY_AI_MODEL_CARD || "ghost-ai-treasury-v1";

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
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
app.use(express.json({ limit: "2mb" }));
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


const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const hashOf = (value) => ghost.keccak256(ghost.toUtf8Bytes(stableStringify(value)));

const computeRiskScore = (seed) => {
  const value = BigInt(seed);
  return Number(value % 101n);
};

const buildShapReport = (inputHash, fields) => {
  const features = fields.length ? fields : ["revenue", "runway", "volatility", "liquidity", "governance"];
  const seed = BigInt(inputHash);
  const report = features.map((feature, idx) => {
    const weight = Number((seed >> BigInt(idx * 8)) & 0xffn) / 255;
    return { feature, weight: Number(weight.toFixed(4)) };
  });
  report.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return report.slice(0, 5);
};

const signPayload = async (payload) => {
  if (!SIGNER_KEY) return null;
  const wallet = new ghost.Wallet(SIGNER_KEY);
  const digest = hashOf(payload);
  const signature = await wallet.signMessage(ghost.getBytes(digest));
  return { signer: wallet.address, digest, signature };
};

const buildProposalCalldata = (controller, action) => {
  if (!controller) return null;
  const iface = new ghost.Interface([
    "function execute((uint8 actionType,address asset,address target,uint256 amount,uint256 value,uint256 destinationChainId,bytes data,bytes32 metadataHash,bytes32 aiProposalHash,uint256 aiRiskScoreBps,bytes32 treatyId))"
  ]);
  return iface.encodeFunctionData("execute", [action]);
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "treasury-ai" }));

app.post("/v1/treasury/forecast", (req, res) => {
  const history = Array.isArray(req.body?.revenueHistory) ? req.body.revenueHistory : [];
  const horizonDays = Number(req.body?.horizonDays || 30);
  const avg = history.length ? history.reduce((a, b) => a + Number(b || 0), 0) / history.length : 0;
  const forecast = Array.from({ length: horizonDays }, (_, i) => Number((avg * (1 + i / (horizonDays * 100))).toFixed(4)));
  const inputHash = hashOf({ history, horizonDays });
  res.json({ ok: true, forecast, inputHash });
});

app.post("/v1/treasury/runway", (req, res) => {
  const cash = Number(req.body?.cash || 0);
  const burnRate = Number(req.body?.burnRate || 1);
  const runwayDays = burnRate > 0 ? Math.floor(cash / burnRate) : 0;
  res.json({ ok: true, runwayDays });
});

app.post("/v1/treasury/stress", (req, res) => {
  const scenarios = Array.isArray(req.body?.scenarios) ? req.body.scenarios : [];
  const impacts = scenarios.map((scenario) => ({
    scenario: scenario?.name || "unknown",
    impactScore: computeRiskScore(hashOf(scenario))
  }));
  res.json({ ok: true, impacts });
});

app.post("/v1/treasury/allocation", (req, res) => {
  const targets = Array.isArray(req.body?.targets) ? req.body.targets : [];
  const total = targets.reduce((sum, t) => sum + Number(t?.weight || 0), 0) || 1;
  const allocations = targets.map((t) => ({
    asset: t?.asset || "unknown",
    weight: Number((Number(t?.weight || 0) / total).toFixed(4))
  }));
  res.json({ ok: true, allocations });
});

app.post("/v1/treasury/incident", (req, res) => {
  const incidentType = req.body?.incidentType || "unspecified";
  const severity = Number(req.body?.severity || 0);
  const response = severity >= 7 ? "defensive" : severity >= 4 ? "caution" : "observe";
  res.json({ ok: true, incidentType, severity, response });
});

app.post("/v1/treasury/proposal", async (req, res) => {
  const input = req.body || {};
  const controllerAddress = input.controllerAddress || process.env.TREASURY_CONTROLLER_ADDRESS || "";
  const action = input.action || {};

  const inputHash = hashOf(input);
  const riskScore = computeRiskScore(inputHash);
  const shapReport = buildShapReport(inputHash, input.features || []);

  const policyLimit = Number(input.maxRiskScoreBps || 7500);
  const policyCompliant = riskScore * 100 <= policyLimit;

  const modelHash = hashOf({ model: MODEL_CARD, version: MODEL_VERSION });
  const proposalCalldata = buildProposalCalldata(controllerAddress, action);

  const evidenceBundleHashes = {
    inputHash,
    outputHash: hashOf({ action, riskScore, policyCompliant, modelHash, shapReport }),
    modelHash
  };

  const output = {
    ok: true,
    modelVersion: MODEL_VERSION,
    modelHash,
    riskScore,
    shapReport,
    policyCompliant,
    proposalTargets: controllerAddress ? [controllerAddress] : [],
    proposalCalldata,
    evidenceBundleHashes
  };

  const signature = await signPayload(output);
  res.json({ ...output, signature });
});

/** GET /v1/treasury/stats — available AI treasury capabilities */
app.get("/v1/treasury/stats", (_req, res) => {
  res.json({ ok: true, stats: { capabilities: ["forecast", "runway", "stress", "allocation", "incident", "proposal"], fetchedAt: new Date().toISOString() } });
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  const status = err.status ?? err.statusCode ?? 500;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[treasury-ai] listening on :${PORT}`);
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
