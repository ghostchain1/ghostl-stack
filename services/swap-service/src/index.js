/**
 * @file swap-service/src/index.js
 * @description GhostChain native swap routing service.
 *
 * Architecture:
 *   - Pair registry loaded from SWAP_PAIRS env var (JSON array) or defaults
 *   - GET  /quote   — constant-product AMM quote (off-chain math + RPC reserves)
 *   - POST /execute — broadcast a pre-signed swap transaction
 *   - GET  /pairs   — list registered token pairs
 *   - GET  /health  — liveness probe
 *
 * Env vars:
 *   PORT              (default 7670)
 *   L2_RPC_URL        GhostChain L2 JSON-RPC (required for live quotes)
 *   L1_RPC_URL        GhostChain L1 JSON-RPC (optional)
 *   L3_RPC_URL        GhostChain L3 JSON-RPC (optional)
 *   MAX_SLIPPAGE_BPS  Default slippage tolerance in basis points (default 100 = 1%)
 *   SWAP_PAIRS        JSON array of pair registrations (see below)
 *
 * SWAP_PAIRS format (set as env var or defaults are used):
 *   [
 *     {
 *       "id":        "GST/USDC",
 *       "chainId":   "l2",
 *       "tokenIn":   "0x…",   // token0 address
 *       "tokenOut":  "0x…",   // token1 address
 *       "amm":       "0x…",   // MinimalAMM (or any x*y=k AMM) address
 *       "adapter":   "0x…"    // MinimalAmmDexAdapter (or IDexAdapter) address
 *     }
 *   ]
 *
 * The service uses a zero-dependency JSON-RPC client to:
 *   1. Read AMM reserve0/reserve1 via eth_call → getReserves()
 *   2. Compute amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)  [no-fee x*y=k]
 *   3. Encode swapExactIn calldata for the adapter contract
 *   4. Return { routes: [{ to, calldata, value, amountOut, priceImpactBps }] }
 */

import express from "express";
import crypto from "node:crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 7670);
const DEFAULT_SLIPPAGE_BPS = Number(process.env.MAX_SLIPPAGE_BPS || 100); // 1%

const RPC_URLS = {
  l1: process.env.L1_RPC_URL || "",
  l2: process.env.L2_RPC_URL || "",
  l3: process.env.L3_RPC_URL || "",
};

// ─── Pair Registry ───────────────────────────────────────────────────────────

/**
 * @typedef {{ id:string, chainId:string, tokenIn:string, tokenOut:string, amm:string, adapter:string }} SwapPair
 * @type {SwapPair[]}
 */
let registeredPairs = [];

function loadPairs() {
  const raw = process.env.SWAP_PAIRS;
  if (!raw) return;
  try {
    registeredPairs = JSON.parse(raw);
  } catch (e) {
    console.error("[swap-service] Failed to parse SWAP_PAIRS:", e.message);
  }
}

/** Find a pair matching tokenIn and tokenOut (order-agnostic) for a given chainId. */
function findPair(tokenIn, tokenOut, chainId) {
  const tI = tokenIn.toLowerCase();
  const tO = tokenOut.toLowerCase();
  return registeredPairs.find((p) => {
    if (chainId && p.chainId && p.chainId !== chainId) return false;
    return (
      (p.tokenIn.toLowerCase() === tI && p.tokenOut.toLowerCase() === tO) ||
      (p.tokenIn.toLowerCase() === tO && p.tokenOut.toLowerCase() === tI)
    );
  }) || null;
}

// ─── JSON-RPC client ─────────────────────────────────────────────────────────

let _rpcId = 1;

/**
 * Make a JSON-RPC call to the chain node.
 * @param {string} rpcUrl
 * @param {string} method
 * @param {unknown[]} params
 * @returns {Promise<unknown>}
 */
async function rpcCall(rpcUrl, method, params = []) {
  const id = _rpcId++;
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} from ${rpcUrl}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  return json.result;
}

// ─── ABI encoding (minimal, no dependencies) ─────────────────────────────────

/** Pad a hex string (without 0x) to 32 bytes (64 hex chars). */
function pad32(hex) {
  return hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

/** Encode a GhostChain address as a 32-byte ABI word. */
function encodeAddress(addr) {
  return pad32(addr);
}

/** Encode a uint256 as a 32-byte ABI word. */
function encodeUint256(value) {
  return pad32(BigInt(value).toString(16));
}

/** Encode a uint16 as a 32-byte ABI word. */
function encodeUint16(value) {
  return pad32(Number(value).toString(16));
}

/** Compute the 4-byte function selector from a signature string. */
function selector(sig) {
  // We use Node's built-in crypto for keccak256 — via createHash('sha3-256') is
  // NOT keccak256. We use the manual approach: encode as UTF-8, then use
  // the fact that GhostChain exposes eth_call with our calldata, so we compute
  // the selector off-chain via a simple lookup or via the native hashing.
  // Node 22 does not expose keccak256 natively — use the WASM-free approach:
  // store the selectors we need for the two contracts.
  return SELECTORS[sig] || _keccak256Selector(sig);
}

// Pre-computed selectors (keccak256 first 4 bytes):
// swapExactIn(address,address,uint256,uint16,address) → 0x3ec0e37a
// reserve0()                                          → 0x443cb4bc
// reserve1()                                          → 0x5a76f25e
// token0()                                            → 0x0dfe1681
// token1()                                            → 0xd21220a7
const SELECTORS = {
  "swapExactIn(address,address,uint256,uint16,address)": "3ec0e37a",
  "reserve0()": "443cb4bc",
  "reserve1()": "5a76f25e",
  "token0()": "0dfe1681",
  "token1()": "d21220a7",
};

function _keccak256Selector(sig) {
  // Fallback: use Node crypto SHA3 (NOT keccak — will be wrong for unsupported
  // sigs; only authoritative selectors are in SELECTORS above).
  const hash = crypto.createHash("sha3-256").update(sig, "utf8").digest("hex");
  return hash.slice(0, 8);
}

/** Encode a call to swapExactIn(address,address,uint256,uint16,address) */
function encodeSwapExactIn(tokenIn, tokenOut, amountIn, slippageBps, recipient) {
  return (
    "0x" +
    selector("swapExactIn(address,address,uint256,uint16,address)") +
    encodeAddress(tokenIn) +
    encodeAddress(tokenOut) +
    encodeUint256(amountIn) +
    encodeUint16(slippageBps) +
    encodeAddress(recipient)
  );
}

/** Encode a no-arg view call (e.g. reserve0(), reserve1(), token0(), token1()) */
function encodeViewCall(sig) {
  return "0x" + selector(sig);
}

/** Decode a uint256 from a 32-byte hex return value. */
function decodeUint256(hex) {
  return BigInt("0x" + hex.replace(/^0x/, ""));
}

/** Decode an address from a 32-byte ABI-encoded hex return value. */
function decodeAddress(hex) {
  return "0x" + hex.replace(/^0x/, "").slice(-40);
}

// ─── Quote logic ─────────────────────────────────────────────────────────────

/**
 * Fetch AMM reserves via eth_call.
 * @param {string} rpcUrl
 * @param {string} ammAddress
 * @returns {Promise<{reserve0: bigint, reserve1: bigint, token0: string, token1: string}>}
 */
async function fetchAmmState(rpcUrl, ammAddress) {
  const [r0Hex, r1Hex, t0Hex, t1Hex] = await Promise.all([
    rpcCall(rpcUrl, "eth_call", [{ to: ammAddress, data: encodeViewCall("reserve0()") }, "latest"]),
    rpcCall(rpcUrl, "eth_call", [{ to: ammAddress, data: encodeViewCall("reserve1()") }, "latest"]),
    rpcCall(rpcUrl, "eth_call", [{ to: ammAddress, data: encodeViewCall("token0()") }, "latest"]),
    rpcCall(rpcUrl, "eth_call", [{ to: ammAddress, data: encodeViewCall("token1()") }, "latest"]),
  ]);
  return {
    reserve0: decodeUint256(r0Hex),
    reserve1: decodeUint256(r1Hex),
    token0:   decodeAddress(t0Hex),
    token1:   decodeAddress(t1Hex),
  };
}

/**
 * Constant-product AMM quote (no fee, matches MinimalAMM).
 * amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
 */
function cpAmmQuote(amountIn, reserveIn, reserveOut) {
  if (reserveIn === 0n || reserveOut === 0n) throw new Error("AMM has no liquidity");
  return (amountIn * reserveOut) / (reserveIn + amountIn);
}

/**
 * Price impact in basis points.
 * impact = (midPrice - execPrice) / midPrice * 10000
 * where midPrice = reserveOut / reserveIn, execPrice = amountOut / amountIn
 */
function priceImpactBps(amountIn, amountOut, reserveIn, reserveOut) {
  if (amountIn === 0n || reserveIn === 0n) return 0;
  // Use integer math: impact_bps = 10000 - (amountOut * reserveIn * 10000) / (amountIn * reserveOut)
  const numerator = amountOut * reserveIn * 10000n;
  const denominator = amountIn * reserveOut;
  if (denominator === 0n) return 0;
  const result = numerator / denominator;
  return Number(10000n - result);
}

// ─── Express app ─────────────────────────────────────────────────────────────

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
app.use((req, res, next) => {
  if (["POST","PUT","PATCH"].includes(req.method) && req.headers["content-type"] &&
      !req.is(["application/json","application/x-www-form-urlencoded"])) {
    return res.status(415).json({ ok: false, error: "Unsupported Media Type" });
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


// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "swap-service",
    pairs: registeredPairs.length,
    rpc: {
      l1: !!RPC_URLS.l1,
      l2: !!RPC_URLS.l2,
      l3: !!RPC_URLS.l3,
    },
    ts: Date.now(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /pairs
// Returns all registered token pairs.
// ─────────────────────────────────────────────────────────────────────────────

app.get("/pairs", (_req, res) => {
  res.json({ pairs: registeredPairs });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /quote?tokenIn=0x…&tokenOut=0x…&amount=<wei>&chainId=l2&slippageBps=100&recipient=0x…
//
// Response:
// {
//   tokenIn, tokenOut, amountIn, chainId,
//   routes: [{
//     to: "<adapter address>",
//     calldata: "0x…",
//     value: "0",
//     amountOut: "<wei>",
//     priceImpactBps: <number>,
//     pair: "<pair id>"
//   }]
// }
// ─────────────────────────────────────────────────────────────────────────────

app.get("/quote", async (req, res) => {
  const { tokenIn, tokenOut, amount, chainId, slippageBps, recipient } = req.query;

  // Validate required params
  if (!tokenIn || !tokenOut || !amount) {
    res.status(400).json({ error: "tokenIn, tokenOut, amount required" });
    return;
  }
  const addrRe = /^0x[0-9a-fA-F]{40}$/;
  if (!addrRe.test(tokenIn) || !addrRe.test(tokenOut)) {
    res.status(400).json({ error: "tokenIn and tokenOut must be 20-byte hex addresses" });
    return;
  }
  if (!/^\d+$/.test(String(amount))) {
    res.status(400).json({ error: "amount must be a decimal integer (wei)" });
    return;
  }
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
    res.status(400).json({ error: "tokenIn and tokenOut must differ" });
    return;
  }

  const chainKey = typeof chainId === "string" ? chainId.toLowerCase() : "l2";
  const amountIn = BigInt(amount);
  const slippage = slippageBps !== undefined ? Number(slippageBps) : DEFAULT_SLIPPAGE_BPS;
  const recipientAddr = typeof recipient === "string" && addrRe.test(recipient) ? recipient : null;

  // Find matching pair
  const pair = findPair(tokenIn, tokenOut, chainKey);
  if (!pair) {
    res.status(404).json({
      error: "no_pair",
      detail: `No registered AMM pair for ${tokenIn}/${tokenOut} on ${chainKey}`,
    });
    return;
  }

  // Resolve RPC URL
  const rpcUrl = RPC_URLS[pair.chainId] || RPC_URLS[chainKey] || RPC_URLS.l2;
  if (!rpcUrl) {
    res.status(503).json({
      error: "rpc_unavailable",
      detail: `No RPC URL configured for chain ${pair.chainId || chainKey}. Set L2_RPC_URL / L1_RPC_URL / L3_RPC_URL`,
    });
    return;
  }

  try {
    // Fetch live AMM state
    const state = await fetchAmmState(rpcUrl, pair.amm);

    // Determine reserveIn/reserveOut based on token ordering
    const isToken0In = state.token0.toLowerCase() === tokenIn.toLowerCase();
    const reserveIn  = isToken0In ? state.reserve0 : state.reserve1;
    const reserveOut = isToken0In ? state.reserve1 : state.reserve0;

    // Compute quote
    const amountOut = cpAmmQuote(amountIn, reserveIn, reserveOut);
    const impactBps = priceImpactBps(amountIn, amountOut, reserveIn, reserveOut);

    // Build calldata for MinimalAmmDexAdapter.swapExactIn(...)
    // The adapter pulls tokenIn from msg.sender, so the tx `to` is the adapter.
    const to = pair.adapter;
    const calldata = encodeSwapExactIn(
      tokenIn,
      tokenOut,
      amountIn,
      slippage,
      recipientAddr || "0x0000000000000000000000000000000000000000"
    );

    res.json({
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      chainId: chainKey,
      routes: [
        {
          pair: pair.id,
          to,
          calldata,
          value: "0",
          amountOut: amountOut.toString(),
          priceImpactBps: impactBps,
          slippageBps: slippage,
        },
      ],
    });
  } catch (e) {
    const msg = /** @type {Error} */ (e).message;
    // If no liquidity or RPC failure, return useful error
    if (msg.includes("no liquidity") || msg.includes("liquidity")) {
      res.status(422).json({ error: "no_liquidity", detail: msg });
    } else if (msg.includes("RPC")) {
      res.status(503).json({ error: "rpc_error", detail: msg });
    } else {
      res.status(500).json({ error: "quote_failed", detail: msg });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /execute
//
// Accepts a pre-signed raw transaction (or unsigned calldata for the gateway
// to sign). Two modes:
//
// Mode A — broadcast (rawTx provided):
//   { rawTx: "0x…", chainId: "l2" }
//   → broadcasts via eth_sendRawTransaction, returns { txHash }
//
// Mode B — calldata passthrough (for wallet-signed flows):
//   { to: "0x…", calldata: "0x…", value: "0", chainId: "l2" }
//   → returns the same { to, calldata, value } for the client to sign & send
//   (this is the mode used by the wallet router swap path)
// ─────────────────────────────────────────────────────────────────────────────

app.post("/execute", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const chainKey = typeof body.chainId === "string" ? body.chainId.toLowerCase() : "l2";

  // ── Mode A: broadcast raw tx ──────────────────────────────────────────────
  if (typeof body.rawTx === "string") {
    if (!/^0x[0-9a-fA-F]+$/.test(body.rawTx)) {
      res.status(400).json({ error: "rawTx must be 0x-prefixed hex" });
      return;
    }
    const rpcUrl = RPC_URLS[chainKey] || RPC_URLS.l2;
    if (!rpcUrl) {
      res.status(503).json({ error: "rpc_unavailable", detail: `No RPC for chain ${chainKey}` });
      return;
    }
    try {
      const txHash = await rpcCall(rpcUrl, "eth_sendRawTransaction", [body.rawTx]);
      res.json({ txHash, chainId: chainKey });
    } catch (e) {
      res.status(502).json({ error: "broadcast_failed", detail: /** @type {Error} */ (e).message });
    }
    return;
  }

  // ── Mode B: calldata passthrough ──────────────────────────────────────────
  const { to, calldata, value } = body;
  const addrRe = /^0x[0-9a-fA-F]{40}$/;
  if (!to || !calldata) {
    res.status(400).json({ error: "Provide rawTx (broadcast) or to + calldata (passthrough)" });
    return;
  }
  if (!addrRe.test(to)) {
    res.status(400).json({ error: "to must be a 20-byte hex address" });
    return;
  }
  if (!/^0x[0-9a-fA-F]*$/.test(calldata)) {
    res.status(400).json({ error: "calldata must be 0x-prefixed hex" });
    return;
  }

  // Return the calldata for the caller to sign + submit
  res.json({
    to,
    calldata,
    value: value ?? "0",
    chainId: chainKey,
    note: "Sign this transaction with your wallet and submit via eth_sendRawTransaction",
  });
});

/** GET /stats — pair count and configured RPC chains */
app.get("/stats", (_req, res) => {
  const configured = Object.entries(RPC_URLS).filter(([, v]) => !!v).map(([k]) => k);
  res.json({ ok: true, stats: { pairs: registeredPairs.length, configuredChains: configured, fetchedAt: new Date().toISOString() } });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

loadPairs();

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
  console.log(`[swap-service] Listening on port ${PORT}`);
  console.log(`[swap-service] Registered pairs: ${registeredPairs.length}`);
  console.log(`[swap-service] RPC: L1=${RPC_URLS.l1 || "—"} L2=${RPC_URLS.l2 || "—"} L3=${RPC_URLS.l3 || "—"}`);
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
