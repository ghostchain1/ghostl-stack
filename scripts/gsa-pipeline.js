#!/usr/bin/env node
/**
 * @file scripts/gsa-pipeline.js
 * @description GhostBrain Sovereign Autonomous Agent — pipeline CLI.
 *
 * Orchestrates the full GSA lifecycle against a running ghostbrain-gsa service:
 *   scan → diagnose → plan → verify → (optional) apply
 *
 * Usage:
 *   node scripts/gsa-pipeline.js [options]
 *
 * Options:
 *   --scan-only          Stop after scan+diagnose (default: full pipeline)
 *   --plan-only          Stop after plan (skips verify + apply)
 *   --apply              Enable apply step (requires GSA_APPLY_ENABLED=true on agent)
 *   --bundle <path>      Path to OGB bundle JSON (required for --apply)
 *   --gsa-url <url>      GSA HTTP base URL (default: http://127.0.0.1:7850)
 *   --json               Emit newline-delimited JSON output (CI-friendly)
 *   --quiet              Suppress progress banners
 *
 * Environment:
 *   GSA_URL                  Override agent URL
 *   CONTROL_PLANE_HMAC_SECRET HMAC key for request signing
 *
 * Exit codes:
 *   0 — pipeline complete, no critical findings (or apply succeeded)
 *   1 — pipeline error (network / parse / policy denied)
 *   2 — critical findings detected (scan returned hasCritical=true)
 *   3 — verify failed (tests red / audit failures)
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync }                              from 'node:fs';
import { parseArgs }                                from 'node:util';

// ─── CLI argument parsing ────────────────────────────────────────────────────
const { values: argv } = parseArgs({
  options: {
    'scan-only':  { type: 'boolean', default: false },
    'plan-only':  { type: 'boolean', default: false },
    'apply':      { type: 'boolean', default: false },
    'bundle':     { type: 'string'                  },
    'gsa-url':    { type: 'string'                  },
    'json':       { type: 'boolean', default: false },
    'quiet':      { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
});

const GSA_URL   = argv['gsa-url'] ?? process.env.GSA_URL ?? 'http://127.0.0.1:7850';
const HMAC_KEY  = process.env.CONTROL_PLANE_HMAC_SECRET ?? '';
const USE_JSON  = argv['json'];
const QUIET     = argv['quiet'];

// ─── Output helpers ──────────────────────────────────────────────────────────
function banner(msg) {
  if (!QUIET && !USE_JSON) console.error(`\n\x1b[34m» ${msg}\x1b[0m`);
}
function log(obj) {
  if (USE_JSON) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
  } else if (!QUIET) {
    console.log(JSON.stringify(obj, null, 2));
  }
}
function warn(msg) {
  console.error(`\x1b[33mWARN\x1b[0m ${msg}`);
}
function fail(msg, code = 1) {
  console.error(`\x1b[31mFAIL\x1b[0m ${msg}`);
  process.exit(code);
}

// ─── HMAC request signing (mirrors auth.js) ──────────────────────────────────
function sign(body, ts = Date.now()) {
  if (!HMAC_KEY) return null;
  return createHmac('sha256', HMAC_KEY)
    .update(`${ts}:${body}`)
    .digest('hex');
}

function authHeaders(body = '') {
  const ts  = Date.now();
  const sig = sign(body, ts);
  const h   = { 'Content-Type': 'application/json' };
  if (sig) {
    h['X-HMAC-Signature'] = sig;
    h['X-HMAC-Timestamp'] = String(ts);
    h['X-Agent-ID']       = 'gsa-pipeline-cli';
  }
  return h;
}

// ─── HTTP client ─────────────────────────────────────────────────────────────
async function request(method, path, body = null) {
  const bodyStr  = body ? JSON.stringify(body) : '';
  const headers  = authHeaders(bodyStr);
  const url      = `${GSA_URL}${path}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: bodyStr || undefined,
    });
  } catch (e) {
    fail(`Cannot reach GSA at ${url}: ${e.message}\n  → Is ghostbrain-gsa running?`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(`GSA returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    fail(`GSA ${method} ${path} → HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Pipeline steps ──────────────────────────────────────────────────────────

async function checkHealth() {
  banner('Checking GSA health …');
  let res;
  try {
    res = await fetch(`${GSA_URL}/health`);
  } catch (e) {
    fail(`GSA health check failed: ${e.message}`);
  }
  if (!res.ok) fail(`GSA returned HTTP ${res.status} on /health`);
  if (!QUIET) console.error('  ✔ GSA is healthy');
}

async function runScan() {
  banner('Phase: SCAN');
  const result = await request('POST', '/scan');
  log({ phase: 'scan', summary: result.summary ?? result });
  return result;
}

async function runPlan(scanResult) {
  banner('Phase: PLAN');
  const result = await request('POST', '/plan', { scanResult });
  log({ phase: 'plan', planId: result.planId, stepCount: result.steps?.length });
  return result;
}

async function runVerify() {
  banner('Phase: VERIFY');
  const result = await request('POST', '/verify');
  log({ phase: 'verify', passed: result.passed, details: result.details ?? result });
  return result;
}

async function runApply(step, bundle) {
  banner('Phase: APPLY');
  const result = await request('POST', '/apply', { step, bundle });
  log({ phase: 'apply', ok: result.ok, details: result });
  return result;
}

async function verifyBundle(bundlePath) {
  banner(`Verifying OGB bundle: ${bundlePath}`);
  let raw;
  try {
    raw = readFileSync(bundlePath, 'utf8');
  } catch (e) {
    fail(`Cannot read bundle file ${bundlePath}: ${e.message}`);
  }

  const result = await request('POST', '/bundle/verify', JSON.parse(raw));
  if (!result.ok) {
    fail(`Bundle verification failed: ${result.reason}`);
  }
  log({ phase: 'bundle-verify', hash: result.hash });
  return { raw: JSON.parse(raw), hash: result.hash };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!QUIET) {
    console.error(`\x1b[34m━━━ GhostBrain GSA Pipeline ━━━\x1b[0m`);
    console.error(`  GSA URL : ${GSA_URL}`);
    console.error(`  Auth    : ${HMAC_KEY ? 'HMAC-SHA256' : 'none (set CONTROL_PLANE_HMAC_SECRET)'}`);
    console.error(`  Mode    : ${argv['apply'] ? 'APPLY' : argv['plan-only'] ? 'PLAN' : argv['scan-only'] ? 'SCAN' : 'FULL'}`);
  }

  await checkHealth();

  // ── Scan ──
  const scanResult = await runScan();

  const hasCritical = scanResult.summary?.hasCritical ?? false;
  if (hasCritical) {
    warn('Critical findings detected!');
  }

  if (argv['scan-only']) {
    console.error('\n✔ scan-only mode — done.');
    process.exit(hasCritical ? 2 : 0);
  }

  // ── Plan ──
  const planResult = await runPlan(scanResult);

  if (argv['plan-only']) {
    console.error('\n✔ plan-only mode — done.');
    process.exit(hasCritical ? 2 : 0);
  }

  // ── Verify ──
  const verifyResult = await runVerify();

  const verifyPassed = verifyResult.passed ?? verifyResult.ok ?? false;
  if (!verifyPassed) {
    fail(`Verify phase failed: ${JSON.stringify(verifyResult.details ?? verifyResult)}`, 3);
  }

  if (!argv['apply']) {
    console.error('\n✔ Pipeline complete (apply not enabled — pass --apply to apply patches).');
    process.exit(hasCritical ? 2 : 0);
  }

  // ── Apply ──
  if (!argv['bundle']) {
    fail('--apply requires --bundle <path-to-ogb-bundle.json>');
  }

  // Verify OGB bundle before applying
  const { raw: bundle } = await verifyBundle(argv['bundle']);

  // Apply each planned step
  const steps = planResult.steps ?? [];
  if (steps.length === 0) {
    console.error('\n✔ No steps in plan — nothing to apply.');
    process.exit(0);
  }

  let appliedCount = 0;
  let failedCount  = 0;
  for (const step of steps) {
    banner(`Applying step [${step.id ?? appliedCount + 1}]: ${step.description ?? '(no description)'}`);
    try {
      const applyResult = await runApply(step, bundle);
      if (applyResult.ok) {
        appliedCount++;
        if (!QUIET) console.error(`  ✔ Step applied`);
      } else {
        failedCount++;
        warn(`Step failed: ${applyResult.reason ?? JSON.stringify(applyResult)}`);
      }
    } catch (e) {
      failedCount++;
      warn(`Step error: ${e.message}`);
    }
  }

  log({
    phase:        'pipeline-complete',
    totalSteps:   steps.length,
    applied:      appliedCount,
    failed:       failedCount,
    hasCritical,
  });

  if (failedCount > 0) {
    fail(`${failedCount}/${steps.length} steps failed`, 1);
  }

  console.error(`\n\x1b[32m✔ Pipeline complete — ${appliedCount}/${steps.length} steps applied.\x1b[0m`);
  process.exit(hasCritical ? 2 : 0);
}

main().catch(e => {
  console.error(`\x1b[31mUnhandled error:\x1b[0m ${e.message}`);
  if (!USE_JSON) console.error(e.stack);
  process.exit(1);
});
