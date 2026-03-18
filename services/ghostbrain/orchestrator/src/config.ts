/**
 * config.ts — GhostBrain Orchestrator configuration.
 *
 * All values read from environment with safe defaults.
 * Chain IDs and ports are canonical — never change without governance approval.
 *
 * GhostChain L1  chain_id = 14000101  RPC :18545
 * GhostL2        chain_id = 901        RPC :29547
 * GhostL3        chain_id = 903        RPC :39545
 */

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v !== undefined ? parseInt(v, 10) : NaN;
  return isNaN(n) ? fallback : n;
}

// ── Service identity ──────────────────────────────────────────────────────────

export const SERVICE  = "ghostbrain-orchestrator";
export const PORT     = envInt("GHOSTBRAIN_ORCHESTRATOR_PORT", 7895);
export const LOG_LEVEL = env("LOG_LEVEL", "info");

// ── Chain RPC endpoints ───────────────────────────────────────────────────────

export const CHAIN_NODES = {
  l1: env("GHOST_L1_RPC_URL", "http://localhost:18545"),
  l2: env("GHOST_L2_RPC_URL", "http://localhost:29547"),
  l3: env("GHOST_L3_RPC_URL", "http://localhost:39545"),
} as const;

export type ChainKey = keyof typeof CHAIN_NODES;

// ── Canonical chain IDs ───────────────────────────────────────────────────────

export const CHAIN_IDS = {
  l1: 14000101,
  l2: 901,
  l3: 903,
} as const;

// ── GhostBrain Core (brain coordination) ─────────────────────────────────────

export const GHOSTBRAIN_CORE_URL = env("GHOSTBRAIN_CORE_URL", "http://localhost:7900");

// ── Signing relay (governance proposals — never write on-chain directly) ──────

export const SIGNING_RELAY_URL = env("SIGNING_RELAY_URL", "http://localhost:7910");

// ── Docker API ────────────────────────────────────────────────────────────────

export const DOCKER_SOCKET = env("DOCKER_SOCKET", "unix:///var/run/docker.sock");

// ── Monitor intervals ─────────────────────────────────────────────────────────

export const NODE_CHECK_INTERVAL_MS      = envInt("NODE_CHECK_INTERVAL_MS",      10_000);
export const VALIDATOR_CHECK_INTERVAL_MS = envInt("VALIDATOR_CHECK_INTERVAL_MS", 15_000);
export const INFRA_SCAN_INTERVAL_MS      = envInt("INFRA_SCAN_INTERVAL_MS",      30_000);
export const AI_ANALYSIS_INTERVAL_MS     = envInt("AI_ANALYSIS_INTERVAL_MS",     20_000);

// ── Thresholds ────────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  /** Maximum normal block lag before a node is considered stale. */
  maxBlockLag:         envInt("THRESHOLD_MAX_BLOCK_LAG",         50),
  /** RPC call timeout (ms). */
  rpcTimeoutMs:        envInt("THRESHOLD_RPC_TIMEOUT_MS",        5_000),
  /** Container restart wait (ms) before re-checking health. */
  restartCooldownMs:   envInt("THRESHOLD_RESTART_COOLDOWN_MS",   60_000),
  /** TPS level that triggers anomaly alarm. */
  tpsAnomalyHigh:      envInt("THRESHOLD_TPS_ANOMALY_HIGH",      50_000),
  /** TPS level that triggers under-load alarm. */
  tpsAnomalyLow:       envInt("THRESHOLD_TPS_ANOMALY_LOW",       0),
  /** Validator participation below this (%) triggers scaling proposal. */
  validatorQuorumPct:  envInt("THRESHOLD_VALIDATOR_QUORUM_PCT",  67),
} as const;

// ── HMAC auth for mutating endpoints ─────────────────────────────────────────

export const HMAC_SECRET = env("ORCHESTRATOR_HMAC_SECRET", "");
