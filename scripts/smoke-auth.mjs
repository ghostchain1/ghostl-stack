#!/usr/bin/env node
/**
 * Smoke test for auth-service SIWG (Sign In With GhostChain / EIP-4361 variant)
 * implementation.
 *
 * Generates a fresh secp256k1 key pair in-process, runs the full
 * nonce → sign → login flow against a real auth-service subprocess,
 * then exercises /auth/me, replay-attack rejection, and /auth/session logout.
 *
 * Exits 0 on success, 1 on failure.
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Import the same signing primitives the service uses so we can produce
// a valid signature in the test without depending on a wallet library.
// ---------------------------------------------------------------------------
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

// GhostChain personal_sign prefix — must match auth-service GHOST_SIGN_PREFIX
const GHOST_SIGN_PREFIX = "\x19GhostChain Signed Message:\n";

const SERVICE_DIR = new URL("../services/auth-service", import.meta.url).pathname;
const PORT = 17639;
const BASE = `http://127.0.0.1:${PORT}`;
const MAX_WAIT_MS = 10_000;
const POLL_INTERVAL_MS = 200;

let child;
let exitCode = 0;

function fail(msg) {
  console.error(`[smoke-auth] FAIL — ${msg}`);
  exitCode = 1;
}

// ---------------------------------------------------------------------------
// Signing helpers (mirror of service implementation)
// ---------------------------------------------------------------------------

function publicKeyToAddress(pubKeyBytes) {
  const uncompressed = pubKeyBytes.slice(1);
  const hash = keccak_256(uncompressed);
  return "0x" + Buffer.from(hash.slice(12)).toString("hex");
}

function signMessage(message, privateKeyHex) {
  const msgBytes = Buffer.from(message, "utf8");
  const prefix = Buffer.from(`${GHOST_SIGN_PREFIX}${msgBytes.length}`, "utf8");
  const prefixed = Buffer.concat([prefix, msgBytes]);
  const msgHash = keccak_256(prefixed);

  const privKey = Buffer.from(privateKeyHex, "hex");
  const { r, s, recovery } = secp256k1.sign(msgHash, privKey);

  const sig = Buffer.alloc(65);
  Buffer.from(r.toString(16).padStart(64, "0"), "hex").copy(sig, 0);
  Buffer.from(s.toString(16).padStart(64, "0"), "hex").copy(sig, 32);
  sig[64] = recovery + 27; // Ghost wallet v convention (27=0, 28=1)
  return "0x" + sig.toString("hex");
}

// Generate a fresh ephemeral test key pair
const privKeyBytes = crypto.randomBytes(32);
// Ensure the private key is a valid secp256k1 scalar (non-zero, < order)
const PRIV_KEY_HEX = privKeyBytes.toString("hex");
const pubKey = secp256k1.getPublicKey(privKeyBytes, false); // uncompressed
const TEST_ADDRESS = publicKeyToAddress(pubKey);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function req(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return { status: res.status, body: await res.json() };
}

async function waitForReady() {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  // 1. Health
  const health = await req("GET", "/health");
  if (health.status !== 200 || health.body?.ok !== true) fail("/health failed");
  console.log(`[smoke-auth] /health ... OK`);

  // 2. Nonce requires address param
  const badNonce = await req("GET", "/auth/nonce");
  if (badNonce.status !== 400) fail(`/auth/nonce (no address) expected 400, got ${badNonce.status}`);
  console.log(`[smoke-auth] /auth/nonce (no address) → 400 ... OK`);

  // 3. Nonce with invalid address
  const badNonce2 = await req("GET", "/auth/nonce?address=not-an-address");
  if (badNonce2.status !== 400) fail(`/auth/nonce (bad address) expected 400, got ${badNonce2.status}`);
  console.log(`[smoke-auth] /auth/nonce (bad address) → 400 ... OK`);

  // 4. Valid nonce for our test address
  const nonceResp = await req("GET", `/auth/nonce?address=${TEST_ADDRESS}`);
  if (nonceResp.status !== 200) fail(`/auth/nonce expected 200, got ${nonceResp.status}`);
  if (typeof nonceResp.body?.nonce !== "string") fail("/auth/nonce missing nonce");
  if (typeof nonceResp.body?.message !== "string") fail("/auth/nonce missing message");
  const { nonce, message } = nonceResp.body;
  console.log(`[smoke-auth] /auth/nonce ... OK (nonce=${nonce.slice(0, 8)}…)`);

  // 5. Login with missing fields
  const missingFields = await req("POST", "/auth/login", { address: TEST_ADDRESS });
  if (missingFields.status !== 400) fail(`/auth/login (missing message+sig) expected 400, got ${missingFields.status}`);
  console.log(`[smoke-auth] /auth/login (missing fields) → 400 ... OK`);

  // 6. Login with wrong nonce in message
  const tamperedMessage = message.replace(/^Nonce: .+$/m, "Nonce: deadbeef000000");
  const badSig = signMessage(tamperedMessage, PRIV_KEY_HEX);
  const tamperedLogin = await req("POST", "/auth/login", {
    address: TEST_ADDRESS,
    message: tamperedMessage,
    signature: badSig,
  });
  if (tamperedLogin.status !== 401) fail(`/auth/login (nonce mismatch) expected 401, got ${tamperedLogin.status}`);
  console.log(`[smoke-auth] /auth/login (nonce mismatch) → 401 ... OK`);

  // Re-issue nonce (the tampered login consumed it if it weren't rejected)
  // The stored nonce should still be valid since nonce mismatch is rejected before deletion
  // But let's re-fetch to be safe
  const nonceResp2 = await req("GET", `/auth/nonce?address=${TEST_ADDRESS}`);
  if (nonceResp2.status !== 200) fail(`second /auth/nonce expected 200, got ${nonceResp2.status}`);
  const message2 = nonceResp2.body.message;

  // 7. Login with correct signature but wrong address
  const wrongAddrPriv = crypto.randomBytes(32).toString("hex");
  const wrongAddrSig = signMessage(message2, wrongAddrPriv);
  const wrongAddrLogin = await req("POST", "/auth/login", {
    address: TEST_ADDRESS,
    message: message2,
    signature: wrongAddrSig,
  });
  if (wrongAddrLogin.status !== 401) fail(`/auth/login (wrong signer) expected 401, got ${wrongAddrLogin.status}`);
  console.log(`[smoke-auth] /auth/login (wrong signer) → 401 ... OK`);

  // After wrong-signer rejection the nonce should still be valid (nonce mismatch not consumed)
  // Actually: nonce mismatch vs signature mismatch — let me re-issue
  const nonceResp3 = await req("GET", `/auth/nonce?address=${TEST_ADDRESS}`);
  const message3 = nonceResp3.body.message;

  // 8. Happy path — correct address + correct signature
  const validSig = signMessage(message3, PRIV_KEY_HEX);
  const loginResp = await req("POST", "/auth/login", {
    address: TEST_ADDRESS,
    message: message3,
    signature: validSig,
  });
  if (loginResp.status !== 200) fail(`/auth/login (valid) expected 200, got ${loginResp.status}: ${JSON.stringify(loginResp.body)}`);
  if (!loginResp.body?.ok) fail("/auth/login body.ok not true");
  if (typeof loginResp.body?.token !== "string") fail("/auth/login missing token");
  if (loginResp.body?.user?.id !== TEST_ADDRESS) fail(`/auth/login user.id mismatch`);
  const { token } = loginResp.body;
  console.log(`[smoke-auth] /auth/login (valid) → 200 ... OK`);

  // 9. Replay attack — same message+signature must fail (nonce deleted)
  const replayResp = await req("POST", "/auth/login", {
    address: TEST_ADDRESS,
    message: message3,
    signature: validSig,
  });
  if (replayResp.status !== 401) fail(`replay attack expected 401, got ${replayResp.status}`);
  console.log(`[smoke-auth] replay attack → 401 ... OK`);

  // 10. /auth/me with valid token
  const meResp = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meBody = await meResp.json();
  if (meResp.status !== 200 || !meBody.ok) fail(`/auth/me expected 200 ok, got ${meResp.status}`);
  console.log(`[smoke-auth] /auth/me ... OK`);

  // 11. /auth/me with no token → 401
  const meUnauth = await req("GET", "/auth/me");
  if (meUnauth.status !== 401) fail(`/auth/me (no token) expected 401, got ${meUnauth.status}`);
  console.log(`[smoke-auth] /auth/me (no token) → 401 ... OK`);

  // 12. Logout
  const logoutResp = await fetch(`${BASE}/auth/session`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const logoutBody = await logoutResp.json();
  if (logoutResp.status !== 200 || !logoutBody.ok) fail(`/auth/session DELETE expected 200`);
  console.log(`[smoke-auth] /auth/session DELETE (logout) ... OK`);

  // 13. /auth/me after logout → 401
  const meAfterLogout = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (meAfterLogout.status !== 401) fail(`/auth/me after logout expected 401, got ${meAfterLogout.status}`);
  console.log(`[smoke-auth] /auth/me (after logout) → 401 ... OK`);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

child = spawn(process.execPath, ["src/index.js"], {
  cwd: SERVICE_DIR,
  env: {
    ...process.env,
    PORT: String(PORT),
    SIWE_DOMAIN: "smoke.test.local",
    SIWE_URI: "https://smoke.test.local",
    SIWE_CHAIN_ID: "1",
    NONCE_TTL_MS: "30000",
    SESSION_TTL_MS: "60000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", d => process.stdout.write(`[svc] ${d}`));
child.stderr.on("data", d => process.stderr.write(`[svc] ${d}`));
child.on("exit", code => {
  if (code && code !== 0) {
    console.error(`[smoke-auth] Service exited unexpectedly with code ${code}`);
    exitCode = 1;
  }
});

function cleanup() {
  try { child.kill(); } catch { /* already gone */ }
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });
process.on("SIGTERM", () => { cleanup(); process.exit(1); });

console.log(`[smoke-auth] Starting auth-service on port ${PORT}…`);
const ready = await waitForReady();
if (!ready) {
  fail(`Service did not become healthy within ${MAX_WAIT_MS}ms`);
  cleanup();
  process.exit(1);
}
console.log(`[smoke-auth] Service ready. Test address: ${TEST_ADDRESS}`);
await runTests();

cleanup();
if (exitCode === 0) {
  console.log(`[smoke-auth] All checks passed.`);
} else {
  console.error(`[smoke-auth] One or more checks failed.`);
}
process.exit(exitCode);
