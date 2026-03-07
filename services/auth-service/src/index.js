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
app.use(express.json());

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

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[auth-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
