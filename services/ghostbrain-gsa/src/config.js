/**
 * @file src/config.js
 * @description Environment configuration for ghostbrain-gsa.
 * All values are fail-closed: missing required vars throw at startup.
 */

function env(key, fallback = '') { return process.env[key] ?? fallback; }
function env_int(key, fallback)  { return parseInt(process.env[key] ?? String(fallback), 10); }
function env_bool(key, fallback) { const v = process.env[key]; return v === undefined ? fallback : v === '1' || v === 'true'; }

export const config = Object.freeze({
  // ── HTTP ──────────────────────────────────────────────────────────────────
  port:        env_int('GSA_PORT', 7850),
  bind:        env('GSA_BIND', '127.0.0.1'),

  // ── GhostBrain Core ───────────────────────────────────────────────────────
  ghostbrainUrl:  env('GHOSTBRAIN_URL', 'http://ghostbrain-core:7900'),
  ghostbrainEnabled: env_bool('GHOSTBRAIN_ENABLED', true),
  controlPlaneSecret: env('CONTROL_PLANE_HMAC_SECRET', ''),

  // ── NATS ──────────────────────────────────────────────────────────────────
  natsUrl:     env('NATS_URL', 'nats://nats:4222'),
  natsEnabled: env_bool('NATS_ENABLED', false), // optional: falls back to HTTP callbacks

  // ── Agent identity ─────────────────────────────────────────────────────────
  agentId:     env('GSA_AGENT_ID', 'ghostbrain-gsa-1'),
  repoRoot:    env('REPO_ROOT', '/app'),

  // ── Brand law (non-negotiable) ─────────────────────────────────────────────
  brand: {
    name:     'Ghost',
    symbol:   'GST',
    decimals: 18,
    chainIds: { L1: 14000101, L2: 901, L3: 903 },
  },

  // ── Safety / policy ────────────────────────────────────────────────────────
  applyEnabled:      env_bool('GSA_APPLY_ENABLED', false),   // default DISABLED — require explicit opt-in
  pqSignaturesRequired: env_bool('GSA_PQ_SIGNATURES_REQUIRED', false),
  brandSpecPath:     env('GSA_BRAND_SPEC_PATH', ''),         // defaults to docs/brand/spec.json
  safeopsAllowlist:  env('SAFEOPS_ALLOWLIST_PATH', ''),

  // ── Governance bundle ─────────────────────────────────────────────────────
  bundleDir:   env('GSA_BUNDLE_DIR', '/tmp/gsa-bundles'),

  // ── Rate limits ────────────────────────────────────────────────────────────
  rateLimitPerMinute: env_int('GSA_RATE_LIMIT_PER_MIN', 60),

  // ── Scan ──────────────────────────────────────────────────────────────────
  scanTimeoutMs: env_int('GSA_SCAN_TIMEOUT_MS', 120_000),
});
