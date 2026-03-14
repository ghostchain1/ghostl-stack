#!/usr/bin/env node
/**
 * Smoke test for global-search-service.
 * Starts the service as a child process, probes /health then runs a
 * set of request/response shape assertions.  Exits 0 on success, 1 on
 * failure, and always cleans up the child process.
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const SERVICE_DIR = new URL("../services/global-search-service", import.meta.url).pathname;
const PORT = 17637; // test port — avoid clashing with the real service
const BASE = `http://127.0.0.1:${PORT}`;
const MAX_WAIT_MS = 10_000;
const POLL_INTERVAL_MS = 200;

let child;
let exitCode = 0;

function fail(msg) {
  console.error(`[smoke-search] FAIL — ${msg}`);
  exitCode = 1;
}

async function waitForReady() {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json() };
}

async function runTests() {
  // 1. Health check
  const health = await get("/health");
  if (health.status !== 200) fail(`/health expected 200, got ${health.status}`);
  if (health.body?.ok !== true) fail(`/health body.ok expected true`);
  if (health.body?.service !== "global-search-service") fail(`/health body.service mismatch`);
  console.log(`[smoke-search] /health ... OK`);

  // 2. Missing q → 400
  const missing = await get("/search");
  if (missing.status !== 400) fail(`/search (no q) expected 400, got ${missing.status}`);
  if (missing.body?.ok !== false) fail(`/search (no q) body.ok expected false`);
  console.log(`[smoke-search] /search (no q) → 400 ... OK`);

  // 3. Valid query — no upstream sources configured → empty matches but correct shape
  const result = await get("/search?q=ghost&limit=5");
  if (result.status !== 200) fail(`/search?q=ghost expected 200, got ${result.status}`);
  const b = result.body;
  if (b?.ok !== true) fail(`/search?q=ghost body.ok expected true`);
  if (b?.query !== "ghost") fail(`body.query expected "ghost", got "${b?.query}"`);
  if (!Array.isArray(b?.matches)) fail(`body.matches expected array`);
  if (typeof b?.total !== "number") fail(`body.total expected number`);
  if (typeof b?.took_ms !== "number") fail(`body.took_ms expected number`);
  console.log(`[smoke-search] /search?q=ghost ... OK (${b.matches.length} matches, ${b.took_ms}ms)`);

  // 4. limit clamping — limit=0 is normalized to 1 internally; shape still valid
  const clamped = await get("/search?q=0x0000000000000000000000000000000000000001&limit=500");
  if (clamped.status !== 200) fail(`/search (address) expected 200, got ${clamped.status}`);
  if (!Array.isArray(clamped.body?.matches)) fail(`/search (address) body.matches not array`);
  if (clamped.body?.matches.length > 100) fail(`limit clamping failed, got ${clamped.body?.matches.length}`);
  console.log(`[smoke-search] /search (address, limit clamped) ... OK`);

  // 5. types filter — valid but unknown type yields empty matches, not error
  const typed = await get("/search?q=ghost&types=rpc");
  if (typed.status !== 200) fail(`/search?types=rpc expected 200, got ${typed.status}`);
  if (!Array.isArray(typed.body?.matches)) fail(`/search?types=rpc body.matches not array`);
  console.log(`[smoke-search] /search?q=ghost&types=rpc ... OK`);
}

// --- Bootstrap ---------------------------------------------------------------

child = spawn(process.execPath, ["src/index.js"], {
  cwd: SERVICE_DIR,
  env: { ...process.env, PORT: String(PORT), SEARCH_TIMEOUT_MS: "2000" },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", d => process.stdout.write(`[svc] ${d}`));
child.stderr.on("data", d => process.stderr.write(`[svc] ${d}`));

child.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`[smoke-search] Service exited unexpectedly with code ${code}`);
    exitCode = 1;
  }
});

function cleanup() {
  try { child.kill(); } catch { /* already gone */ }
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });
process.on("SIGTERM", () => { cleanup(); process.exit(1); });

console.log(`[smoke-search] Starting global-search-service on port ${PORT}...`);
const ready = await waitForReady();
if (!ready) {
  fail(`Service did not become healthy within ${MAX_WAIT_MS}ms`);
  cleanup();
  process.exit(1);
}
console.log(`[smoke-search] Service ready.`);
await runTests();

cleanup();
if (exitCode === 0) {
  console.log(`[smoke-search] All checks passed.`);
} else {
  console.error(`[smoke-search] One or more checks failed.`);
}
process.exit(exitCode);
