import express from "express";
import crypto from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

const PORT = Number(process.env.PORT || 7639);
// Domain shown in the EIP-4361 message — override in production via env
const SIWE_DOMAIN = process.env.SIWE_DOMAIN || "ghostchain.local";
const SIWE_URI = process.env.SIWE_URI || `https://${SIWE_DOMAIN}`;
const SIWE_CHAIN_ID = Number(process.env.SIWE_CHAIN_ID || 14000101);
const NONCE_TTL_MS = Number(process.env.NONCE_TTL_MS || 5 * 60 * 1000); // 5 min
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000); // 24 h

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


// ---------------------------------------------------------------------------
// In-memory stores (per-process; sufficient for a single-replica service)
// ---------------------------------------------------------------------------
/** @type {Map<string, {nonce:string, issuedAt:string, expiresAt:number}>} */
const nonceStore = new Map(); // address → pending nonce
/** @type {Map<string, {user:object, createdAt:number, expiresAt:number}>} */
const sessions = new Map(); // token → session

const randomHex = (bytes = 16) => crypto.randomBytes(bytes).toString("hex");

/** Prune expired nonces and sessions to prevent unbounded memory growth. */
function prune() {
  const now = Date.now();
  for (const [addr, rec] of nonceStore) {
    if (rec.expiresAt < now) nonceStore.delete(addr);
  }
  for (const [token, rec] of sessions) {
    if (rec.expiresAt < now) sessions.delete(token);
  }
}
setInterval(prune, 60_000).unref();

// ---------------------------------------------------------------------------
// Ghost address / SIWG helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a Ghost/GhostChain address to lowercase.
 * Returns null if the string is not a valid 0x-prefixed 20-byte address.
 */
function normalizeAddress(addr) {
  if (typeof addr !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  return addr.toLowerCase();
}

/**
 * Compute the GhostChain address from a 65-byte uncompressed public key.
 */
function publicKeyToAddress(pubKeyBytes) {
  // Drop the 0x04 prefix, hash remaining 64 bytes (x, y coordinates)
  const uncompressed = pubKeyBytes.slice(1);
  const hash = keccak_256(uncompressed);
  // Take last 20 bytes
  return "0x" + Buffer.from(hash.slice(12)).toString("hex");
}

/**
 * GhostChain personal_sign prefix (analogous to EIP-191 personal_sign but
 * branded for the sovereign GhostChain signing standard — SIWG).
 * Ghost wallets prepend this string before hashing the message to sign.
 */
const GHOST_SIGN_PREFIX = "\x19GhostChain Signed Message:\n";

/**
 * Recover the signing address from a SIWG (Sign In With GhostChain) signature.
 * Uses the GhostChain personal_sign prefix + secp256k1 ECDSA recovery.
 */
function recoverAddress(message, signature) {
  const hexSig = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (hexSig.length !== 130) {
    throw new Error("signature must be 65 bytes (130 hex chars)");
  }

  const sigBytes = Buffer.from(hexSig, "hex");
  const r = sigBytes.subarray(0, 32);
  const s = sigBytes.subarray(32, 64);
  let v = sigBytes[64];
  // Normalise v: Ghost wallets emit 27/28; secp256k1 recovery uses 0/1
  if (v === 27 || v === 28) v -= 27;
  if (v !== 0 && v !== 1) throw new Error(`invalid recovery id: ${v}`);

  const msgBytes = Buffer.from(message, "utf8");
  const prefix = Buffer.from(`${GHOST_SIGN_PREFIX}${msgBytes.length}`, "utf8");
  const prefixed = Buffer.concat([prefix, msgBytes]);
  const msgHash = keccak_256(prefixed);

  const sig = new secp256k1.Signature(
    BigInt(`0x${r.toString("hex")}`),
    BigInt(`0x${s.toString("hex")}`),
  ).addRecoveryBit(v);

  const pubKey = sig.recoverPublicKey(msgHash);
  return publicKeyToAddress(pubKey.toRawBytes(false)); // uncompressed
}

/**
 * Build a minimal EIP-4361 (SIWE) message.
 */
function buildSiwgMessage({ domain, address, uri, chainId, nonce, issuedAt, expirationTime }) {
  return [
    `${domain} wants you to sign in with your GhostChain account:`,
    address,
    "",
    "Sign in to GhostChain",
    "",
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join("\n");
}

function extractNonce(message) {
  const m = /^Nonce: (.+)$/m.exec(message);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "auth-service" }),
);

/**
 * GET /auth/nonce?address=0x…
 * Issues a time-limited nonce and returns the full EIP-4361 message to sign.
 */
app.get("/auth/nonce", (req, res) => {
  const address = normalizeAddress(String(req.query.address ?? ""));
  if (!address) {
    return res.status(400).json({ ok: false, error: "valid address query parameter required" });
  }

  const nonce = randomHex(12);
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const expirationTime = new Date(expiresAt).toISOString();

  nonceStore.set(address, { nonce, issuedAt, expiresAt });

  const message = buildSiwgMessage({
    domain: SIWE_DOMAIN,
    address,
    uri: SIWE_URI,
    chainId: SIWE_CHAIN_ID,
    nonce,
    issuedAt,
    expirationTime,
  });

  res.json({ ok: true, nonce, message });
});

/**
 * POST /auth/login
 * Body: { address, message, signature }
 * Verifies the EIP-4361 signature and issues a session token.
 */
app.post("/auth/login", (req, res) => {
  const { address: rawAddress, message, signature } = req.body || {};

  const address = normalizeAddress(rawAddress);
  if (!address) {
    return res.status(400).json({ ok: false, error: "address required (0x-prefixed 20-byte hex)" });
  }
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ ok: false, error: "message required" });
  }
  if (typeof signature !== "string" || !signature.trim()) {
    return res.status(400).json({ ok: false, error: "signature required" });
  }

  // --- Nonce verification ---
  const pending = nonceStore.get(address);
  if (!pending) {
    return res.status(401).json({ ok: false, error: "no pending nonce for this address; call GET /auth/nonce first" });
  }
  if (Date.now() > pending.expiresAt) {
    nonceStore.delete(address);
    return res.status(401).json({ ok: false, error: "nonce expired" });
  }
  const messageNonce = extractNonce(message);
  if (!messageNonce || messageNonce !== pending.nonce) {
    return res.status(401).json({ ok: false, error: "nonce mismatch" });
  }

  // --- Signature verification ---
  let recovered;
  try {
    recovered = recoverAddress(message, signature);
  } catch (err) {
    return res.status(400).json({ ok: false, error: `invalid signature: ${err.message}` });
  }
  if (recovered !== address) {
    return res.status(401).json({ ok: false, error: "signature does not match address" });
  }

  // Nonce consumed — delete to prevent replay
  nonceStore.delete(address);

  // --- Issue session ---
  const token = randomHex(24);
  const now = Date.now();
  const user = { id: address, wallets: [rawAddress], roles: ["Viewer"] };
  sessions.set(token, { user, createdAt: now, expiresAt: now + SESSION_TTL_MS });

  res.json({ ok: true, token, user });
});

/**
 * GET /auth/me
 * Returns the current session if the Bearer token is valid.
 */
app.get("/auth/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ ok: false, error: "missing Authorization header" });

  const session = sessions.get(token);
  if (!session) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, error: "session expired" });
  }

  res.json({ ok: true, session });
});

/**
 * DELETE /auth/session
 * Revokes the current session (logout).
 */
app.delete("/auth/session", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

/** GET /auth/stats — session and nonce aggregate counts */
app.get("/auth/stats", (_req, res) => {
  const now = Date.now();
  const activeSessions = [...sessions.values()].filter((s) => s.expiresAt > now).length;
  const pendingNonces = [...nonceStore.values()].filter((n) => n.expiresAt > now).length;
  res.json({ ok: true, stats: { activeSessions, pendingNonces, totalSessions: sessions.size, totalNonces: nonceStore.size, sessionTtlMs: SESSION_TTL_MS, nonceTtlMs: NONCE_TTL_MS, fetchedAt: new Date().toISOString() } });
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
  console.log(`[auth-service] listening on :${PORT}`);
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
