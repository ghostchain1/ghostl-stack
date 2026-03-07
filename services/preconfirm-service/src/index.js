import "dotenv/config";
import express from "express";
import promClient from "prom-client";
import { ghost } from "ghost";
import fs from "node:fs";

const PORT = Number(process.env.PORT || "7691");
const RPC_URL = process.env.RPC_URL || process.env.RPC || "";
const LAYER_RAW = process.env.LAYER || "l2";

const PRECONFIRM_NAME = process.env.PRECONFIRM_EIP712_NAME || "GhostPreconfirm";
const PRECONFIRM_VERSION = process.env.PRECONFIRM_EIP712_VERSION || "1";
const PRECONFIRM_VERIFYING_CONTRACT =
  process.env.PRECONFIRM_EIP712_VERIFYING_CONTRACT || "0x0000000000000000000000000000000000000000";

const ttlMsRaw = Number(process.env.PRECONFIRM_TTL_MS || "5000");
const PRECONFIRM_TTL_MS = Number.isFinite(ttlMsRaw) ? Math.max(500, Math.floor(ttlMsRaw)) : 5000;

const GUARD_EVAL_URL =
  process.env.GUARD_EVAL_URL ||
  (process.env.GUARD_URL ? `${String(process.env.GUARD_URL).replace(/\/$/, "")}/gate/eval` : "");
const guardFailOpen = (process.env.GUARD_FAIL_OPEN || "0").toLowerCase() === "1" || (process.env.GUARD_FAIL_OPEN || "").toLowerCase() === "true";

const rpcTimeoutMs = Math.max(500, Number(process.env.RPC_TIMEOUT_MS || "12000"));
const guardTimeoutMs = Math.max(200, Number(process.env.GUARD_TIMEOUT_MS || "1500"));

function parseLayer(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === "1" || v === "l1") return 1;
  if (v === "2" || v === "l2") return 2;
  if (v === "3" || v === "l3") return 3;
  return 2;
}

const LAYER_ID = parseLayer(LAYER_RAW);

function readSecret(key) {
  const filePath = process.env[`${key}_FILE`] || "";
  if (filePath) {
    try {
      const value = String(fs.readFileSync(filePath, "utf8")).trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return process.env[key] || "";
}

function selectSigningKey() {
  const primary = readSecret("PRECONFIRM_SIGNER_PRIVATE_KEY");
  if (primary) return primary;
  if (LAYER_ID === 2) return readSecret("PRECONFIRM_SIGNER_PRIVATE_KEY_L2");
  if (LAYER_ID === 3) return readSecret("PRECONFIRM_SIGNER_PRIVATE_KEY_L3");
  return "";
}

const SIGNER_PRIVATE_KEY = selectSigningKey();
const observeOnly = !SIGNER_PRIVATE_KEY;
const signer = observeOnly ? null : new ghost.Wallet(SIGNER_PRIVATE_KEY);

if (!RPC_URL) {
  console.error("Missing required env: RPC_URL");
  process.exit(1);
}

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const metricsPrefix = "ghost_preconfirm";
const requestCounter = new promClient.Counter({
  name: `${metricsPrefix}_requests_total`,
  help: "total preconfirm requests",
  labelNames: ["layer", "result"],
  registers: [register]
});
const rpcDuration = new promClient.Histogram({
  name: `${metricsPrefix}_rpc_duration_seconds`,
  help: "json-rpc request duration",
  labelNames: ["method"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register]
});
const guardDuration = new promClient.Histogram({
  name: `${metricsPrefix}_guard_duration_seconds`,
  help: "guard eval duration",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register]
});

let cachedChainId = null; // number
let chainIdFetchedAt = 0;
const chainIdCacheMs = Math.max(1_000, Number(process.env.CHAIN_ID_CACHE_MS || "30000"));
const CHAIN_ID_METHOD = process.env.CHAIN_ID_METHOD || "gst_chainId";

async function fetchChainId() {
  const now = Date.now();
  if (cachedChainId && now - chainIdFetchedAt < chainIdCacheMs) return cachedChainId;
  const raw = await rpcRequest(CHAIN_ID_METHOD, []);
  const hex = raw?.result;
  if (typeof hex === "string" && hex.startsWith("0x")) {
    const id = Number.parseInt(hex, 16);
    if (Number.isFinite(id) && id > 0) {
      cachedChainId = id;
      chainIdFetchedAt = now;
      return id;
    }
  }
  return cachedChainId;
}

async function rpcRequest(method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), rpcTimeoutMs);
  const end = rpcDuration.labels(method).startTimer();
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    });
    const body = await res.json().catch(async () => ({ error: { message: await res.text().catch(() => "bad_json") } }));
    return body;
  } finally {
    clearTimeout(timer);
    end();
  }
}

async function guardEval(context) {
  if (!GUARD_EVAL_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), guardTimeoutMs);
  const end = guardDuration.startTimer();
  try {
    const res = await fetch(GUARD_EVAL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(context)
    });
    if (!res.ok) throw new Error(`guard_http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    end();
  }
}

function txSummaryFromRawTx(raw) {
  const tx = ghost.Transaction.from(raw);
  const dataHex = tx.data ?? "0x";
  const selector = dataHex.startsWith("0x") && dataHex.length >= 10 ? dataHex.slice(0, 10) : "0x00000000";
  return {
    tx,
    summary: {
      hash: tx.hash,
      from: tx.from ? ghost.getAddress(tx.from) : null,
      to: tx.to ? ghost.getAddress(tx.to) : null,
      nonce: tx.nonce,
      type: tx.type,
      value: tx.value?.toString?.() ?? String(tx.value ?? "0"),
      gasLimit: tx.gasLimit?.toString?.() ?? null,
      dataLength: dataHex.length > 2 ? dataHex.length / 2 - 1 : 0,
      dataHash: ghost.keccak256(dataHex),
      selector,
      chainId: tx.chainId ? Number(tx.chainId) : null
    }
  };
}

function json(res, code, obj) {
  res.status(code).set("content-type", "application/json").send(JSON.stringify(obj));
}

const app = express();
process.title = process.env.npm_package_name ?? 'ghoststack';
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
app.use(express.json({ limit: "1mb", reviver: _safeReviver }));
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
  res.on("prefinish", () => { const _ms = (Number(process.hrtime.bigint()-t0)/1e6).toFixed(2); res.setHeader("X-Response-Time", `${_ms}ms`); res.setHeader("Server-Timing", `total;dur=${_ms}`); });
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: +(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2), bytes: Number(req.headers["content-length"] ?? 0), reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


app.get("/health", async (_req, res) => {
  let chainId = null;
  try {
    chainId = await fetchChainId();
  } catch {
    chainId = cachedChainId;
  }
  json(res, 200, {
    ok: true,
    observeOnly,
    signer: signer ? await signer.getAddress() : null,
    rpcUrl: RPC_URL,
    chainId,
    layer: LAYER_ID,
    guard: { enabled: Boolean(GUARD_EVAL_URL), failOpen: guardFailOpen },
    ttlMs: PRECONFIRM_TTL_MS
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("content-type", register.contentType);
  res.end(await register.metrics());
});

app.post("/v1/preconfirm", async (req, res) => {
  const rawTx = req.body?.rawTx || req.body?.raw || req.body?.tx;
  if (!rawTx || typeof rawTx !== "string" || !rawTx.startsWith("0x")) {
    requestCounter.labels(String(LAYER_ID), "bad_request").inc();
    return json(res, 400, { ok: false, error: "missing_rawTx" });
  }

  let parsed;
  try {
    parsed = txSummaryFromRawTx(rawTx);
  } catch (err) {
    requestCounter.labels(String(LAYER_ID), "bad_request").inc();
    return json(res, 400, { ok: false, error: "invalid_rawTx", message: err?.message || String(err) });
  }

  const txHash = parsed.summary.hash;

  let guardDecision = null;
  if (GUARD_EVAL_URL) {
    try {
      guardDecision = await guardEval({ role: "preconfirm", layer: LAYER_ID, tx: parsed.summary });
      const action = String(guardDecision?.action || "allow").toLowerCase();
      if (action !== "allow") {
        const retryAt = guardDecision?.retryAt ?? null;
        requestCounter.labels(String(LAYER_ID), action).inc();
        const status = action === "delay" ? 429 : 403;
        return json(res, status, {
          ok: false,
          action,
          reason: guardDecision?.reason || "guard",
          retryAt,
          guard: guardDecision
        });
      }
    } catch (err) {
      guardDecision = { action: "error", reason: "guard_unreachable", message: err?.message || String(err) };
      if (!guardFailOpen) {
        requestCounter.labels(String(LAYER_ID), "guard_error").inc();
        return json(res, 503, { ok: false, error: "guard_unreachable", guard: guardDecision });
      }
    }
  }

  let rpcResult;
  try {
    rpcResult = await rpcRequest("ghost_sendTransaction", [rawTx]);
  } catch (err) {
    requestCounter.labels(String(LAYER_ID), "rpc_error").inc();
    return json(res, 502, { ok: false, error: "rpc_error", message: err?.message || String(err) });
  }

  if (rpcResult?.error) {
    requestCounter.labels(String(LAYER_ID), "rpc_error").inc();
    return json(res, 502, { ok: false, error: "rpc_error", rpc: rpcResult.error });
  }

  const rpcTxHash = rpcResult?.result;
  if (typeof rpcTxHash !== "string" || !rpcTxHash.startsWith("0x")) {
    requestCounter.labels(String(LAYER_ID), "rpc_error").inc();
    return json(res, 502, { ok: false, error: "rpc_invalid_response", rpc: rpcResult });
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = Math.floor((Date.now() + PRECONFIRM_TTL_MS) / 1000);

  let chainId = null;
  try {
    chainId = await fetchChainId();
  } catch {
    chainId = cachedChainId;
  }
  if (!chainId && parsed.summary.chainId) chainId = parsed.summary.chainId;

  if (chainId && parsed.summary.chainId && chainId !== parsed.summary.chainId) {
    // Upstream may still accept the tx hash, but the signature would be ambiguous across chains.
    requestCounter.labels(String(LAYER_ID), "chain_mismatch").inc();
    return json(res, 400, {
      ok: false,
      error: "chain_id_mismatch",
      txChainId: parsed.summary.chainId,
      rpcChainId: chainId,
      txHash,
      rpcTxHash
    });
  }

  const payload = {
    txHash,
    issuedAt,
    expiresAt,
    layer: LAYER_ID
  };

  let signature = null;
  let digest = null;
  let signerAddress = null;
  if (signer && chainId) {
    const domain = {
      name: PRECONFIRM_NAME,
      version: PRECONFIRM_VERSION,
      chainId,
      verifyingContract: PRECONFIRM_VERIFYING_CONTRACT
    };
    const types = {
      Preconfirm: [
        { name: "txHash", type: "bytes32" },
        { name: "issuedAt", type: "uint256" },
        { name: "expiresAt", type: "uint256" },
        { name: "layer", type: "uint8" }
      ]
    };
    digest = ghost.TypedDataEncoder.hash(domain, types, payload);
    signature = await signer.signTypedData(domain, types, payload);
    signerAddress = await signer.getAddress();
  }

  requestCounter.labels(String(LAYER_ID), "ok").inc();
  return json(res, 200, {
    ok: true,
    observeOnly,
    txHash,
    rpcTxHash,
    chainId,
    layer: LAYER_ID,
    issuedAt,
    expiresAt,
    signer: signerAddress,
    digest,
    signature,
    guard: guardDecision
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
  console.log(
    `[preconfirm-service] listening on :${PORT} layer=${LAYER_ID} rpc=${RPC_URL} observeOnly=${observeOnly} guard=${Boolean(GUARD_EVAL_URL)}`
  );
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
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGQUIT", () => {
  _draining = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "drain_start", pid: process.pid }));
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
