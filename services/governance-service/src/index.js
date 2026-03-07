import express from "express";

const PORT = Number(process.env.PORT || 7645);
const DEFAULT_LAYER = (process.env.GOVERNANCE_LAYER || process.env.DEFAULT_LAYER || "L1").toUpperCase();
const layerValue = (value) => String(value || "").toUpperCase();
const normalizeLayer = (value) => {
  const raw = layerValue(value);
  if (raw === "1" || raw === "L1") return "L1";
  if (raw === "2" || raw === "L2") return "L2";
  if (raw === "3" || raw === "L3") return "L3";
  return "";
};

const layerConfigs = {
  L1: {
    rpc: process.env.GOVERNANCE_RPC_L1 || process.env.RPC_L1 || process.env.GOVERNANCE_RPC || "",
    governor: (process.env.GOVERNOR_ADDRESS_L1 || process.env.GOVERNOR_ADDRESS || process.env.GOVERNANCE_CONTRACT_ADDRESS || "").toLowerCase(),
    executor: (process.env.EXECUTOR_ADDRESS_L1 || process.env.EXECUTOR_ADDRESS || "").toLowerCase(),
    chainId: process.env.GOVERNANCE_CHAIN_ID_L1 || process.env.L1_CHAIN_ID || ""
  },
  L2: {
    rpc: process.env.GOVERNANCE_RPC_L2 || process.env.RPC_L2 || "",
    governor: (process.env.GOVERNOR_ADDRESS_L2 || "").toLowerCase(),
    executor: (process.env.EXECUTOR_ADDRESS_L2 || "").toLowerCase(),
    chainId: process.env.GOVERNANCE_CHAIN_ID_L2 || process.env.L2_CHAIN_ID || ""
  },
  L3: {
    rpc: process.env.GOVERNANCE_RPC_L3 || process.env.RPC_L3 || "",
    governor: (process.env.GOVERNOR_ADDRESS_L3 || "").toLowerCase(),
    executor: (process.env.EXECUTOR_ADDRESS_L3 || "").toLowerCase(),
    chainId: process.env.GOVERNANCE_CHAIN_ID_L3 || process.env.L3_CHAIN_ID || ""
  }
};

const resolveLayer = (req) => {
  const layerParam = normalizeLayer(req.query?.layer || req.query?.network || "");
  if (layerParam) return layerParam;
  const chainIdParam = String(req.query?.chainId || "");
  if (chainIdParam) {
    const match = Object.entries(layerConfigs).find(([, config]) => String(config.chainId || "") === chainIdParam);
    if (match) return match[0];
  }
  return normalizeLayer(DEFAULT_LAYER) || "L1";
};

const SELECTORS = {
  proposalsLength: "0x44c7c867",
  votingPeriod: "0x02a251a3",
  executor: "0xc34c08e5",
  votingToken: "0xb0340123",
  propose: "0x93ba3f15",
  vote: "0xc9d27afe",
  queue: "0xddf0b009",
  execute: "0xfe0d94c1"
};

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
app.use(express.json({ limit: "1mb" }));
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


const proposals = [];
const delegations = [];

const strip0x = (value = "") => (value.startsWith("0x") ? value.slice(2) : value);
const pad32 = (value = "") => value.padStart(64, "0");
const toHex = (value) => {
  if (typeof value === "bigint") return value.toString(16);
  if (typeof value === "number") return BigInt(value).toString(16);
  if (typeof value === "string") {
    if (value.startsWith("0x")) return strip0x(value);
    return BigInt(value).toString(16);
  }
  return "0";
};
const encodeUint = (value) => pad32(toHex(value));
const encodeBool = (value) => pad32(value ? "1" : "0");
const encodeAddress = (value) => pad32(strip0x(String(value || "")).toLowerCase());
const encodeBytes = (value = "0x") => {
  const raw = strip0x(String(value || ""));
  const length = raw.length / 2;
  const paddedLen = Math.ceil(length / 32) * 64;
  return pad32(length.toString(16)) + raw.padEnd(paddedLen, "0");
};
const decodeAddress = (hex) => {
  if (!hex || hex === "0x") return null;
  return `0x${strip0x(hex).slice(-40)}`;
};
const decodeUint = (hex) => {
  try {
    return BigInt(hex || "0x0").toString();
  } catch {
    return "0";
  }
};

const rpc = async (rpcUrl, method, params = []) => {
  if (!rpcUrl) throw new Error("GOVERNANCE_RPC not configured");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`RPC ${method} status ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || String(body.error));
  return body.result;
};

const ethCall = async (rpcUrl, to, data) =>
  rpc(rpcUrl, "ghost_call", [
    {
      to,
      data
    },
    "latest"
  ]);

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "governance-service", layers: Object.keys(layerConfigs), defaultLayer: DEFAULT_LAYER })
);
app.get("/config", (req, res) => {
  const layer = resolveLayer(req);
  const config = layerConfigs[layer] || {};
  res.json({
    ok: true,
    layer,
    governor: config.governor || null,
    executor: config.executor || null,
    rpc: config.rpc || null,
    chainId: config.chainId || null
  });
});

app.get("/onchain", async (req, res) => {
  const layer = resolveLayer(req);
  const config = layerConfigs[layer] || {};
  if (!config.governor) {
    res.status(400).json({ ok: false, error: "GOVERNOR_ADDRESS not configured", layer });
    return;
  }
  try {
    const [chainId, proposalsLength, votingPeriod, executor, votingToken] = await Promise.all([
      rpc(config.rpc, "ghost_chainId"),
      ethCall(config.rpc, config.governor, SELECTORS.proposalsLength),
      ethCall(config.rpc, config.governor, SELECTORS.votingPeriod),
      ethCall(config.rpc, config.governor, SELECTORS.executor),
      ethCall(config.rpc, config.governor, SELECTORS.votingToken)
    ]);
    res.json({
      ok: true,
      chainId,
      layer,
      governor: config.governor,
      executor: decodeAddress(executor),
      votingToken: decodeAddress(votingToken),
      proposalsLength: decodeUint(proposalsLength),
      votingPeriod: decodeUint(votingPeriod)
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/proposals", (_req, res) => {
  res.json({ ok: true, proposals });
});

app.get("/delegations", (_req, res) => {
  res.json({ ok: true, delegations });
});

/** GET /proposals/stats — aggregate proposal and delegation counts */
app.get("/proposals/stats", (_req, res) => {
  res.json({ ok: true, stats: { totalProposals: proposals.length, totalDelegations: delegations.length, fetchedAt: new Date().toISOString() } });
});

app.post("/calldata", (req, res) => {
  const action = String(req.body?.action || "").toLowerCase();
  const layer = resolveLayer(req);
  const config = layerConfigs[layer] || {};
  try {
    if (!config.governor) {
      res.status(400).json({ ok: false, error: "GOVERNOR_ADDRESS not configured", layer });
      return;
    }
    if (action === "propose") {
      const target = req.body?.target;
      const value = req.body?.value ?? "0";
      const data = req.body?.data ?? "0x";
      if (!target) throw new Error("missing target");
      const head =
        encodeAddress(target) + encodeUint(value) + pad32("60"); // offset to bytes
      const tail = encodeBytes(data);
      const calldata = SELECTORS.propose + head + tail;
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    if (action === "vote") {
      const id = req.body?.id;
      const support = !!req.body?.support;
      if (id === undefined || id === null) throw new Error("missing id");
      const calldata = SELECTORS.vote + encodeUint(id) + encodeBool(support);
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    if (action === "queue") {
      const id = req.body?.id;
      if (id === undefined || id === null) throw new Error("missing id");
      const calldata = SELECTORS.queue + encodeUint(id);
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    if (action === "execute") {
      const id = req.body?.id;
      if (id === undefined || id === null) throw new Error("missing id");
      const calldata = SELECTORS.execute + encodeUint(id);
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  if (err.status === 405 || err.statusCode === 405) return res.status(405).json({ ok: false, error: "Method not allowed" });
  const status = err.status ?? err.statusCode ?? 500;
  const _isProd = process.env.NODE_ENV === "production";
  res.setHeader("Cache-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  const defaultLayer = normalizeLayer(DEFAULT_LAYER) || "L1";
  const cfg = layerConfigs[defaultLayer] || {};
  console.log(
    `[governance-service] listening on :${PORT} defaultLayer=${defaultLayer} rpc=${cfg.rpc || "unset"}`
  );
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
