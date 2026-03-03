/**
 * GhostBrain Core — Configuration
 *
 * All configuration is sourced from environment variables.
 * No secrets are hardcoded here.
 */

export const SERVICE_NAME = "ghostbrain-core";
export const VERSION = "0.1.0";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// ─── Server ──────────────────────────────────────────────────────────────────
export const PORT = parseInt(optional("PORT", "7900"), 10);
export const NODE_ENV = optional("NODE_ENV", "development");

// ─── Chain IDs (routing law) ─────────────────────────────────────────────────
export const CHAIN_IDS = {
  L1: parseInt(required("GHOSTAI_L1_CHAIN_ID"), 10),
  L2: parseInt(required("GHOSTAI_L2_CHAIN_ID"), 10),
  L3: parseInt(required("GHOSTAI_L3_CHAIN_ID"), 10),
} as const;

// ─── NATS ─────────────────────────────────────────────────────────────────────
export const NATS_URL = optional("NATS_URL", "nats://localhost:4222");

// ─── Postgres ─────────────────────────────────────────────────────────────────
export const POSTGRES_URL = optional("GHOSTBRAIN_POSTGRES_URL", "postgresql://ghostbrain:ghostbrain@localhost:5432/ghostbrain");

// ─── Redis ────────────────────────────────────────────────────────────────────
export const REDIS_URL = optional("GHOSTBRAIN_REDIS_URL", "redis://localhost:6379");

// ─── Vault ────────────────────────────────────────────────────────────────────
export const VAULT_ADDR = optional("VAULT_ADDR", "http://localhost:8200");
export const VAULT_ROLE_ID = optional("VAULT_ROLE_ID", "");

// ─── Observability ────────────────────────────────────────────────────────────
export const PROMETHEUS_URL = optional("PROMETHEUS_URL", "http://localhost:9090");
export const LOKI_URL = optional("LOKI_URL", "http://localhost:3100");

// ─── Brain loop ───────────────────────────────────────────────────────────────
export const TICK_INTERVAL_SECONDS = parseInt(optional("BRAIN_TICK_SECONDS", "30"), 10);
export const CANARY_WINDOW_SECONDS = parseInt(optional("CANARY_WINDOW_SECONDS", "120"), 10);
export const MAX_BLAST_RADIUS = parseInt(optional("MAX_BLAST_RADIUS", "3"), 10);

// ─── GhostContractAI Registry (routing law authority) ─────────────────────────
export const GHOSTAI_REGISTRY_ADDRESS = optional("GHOSTAI_REGISTRY_ADDRESS", "");
export const GHOSTAI_GOVERNOR_ADDRESS = optional("GHOSTAI_GOVERNOR_ADDRESS", "");
export const GHOSTAI_POLICY_GATE_ADDRESS = optional("GHOSTAI_POLICY_GATE_ADDRESS", "");
export const GHOSTAI_RISK_ORACLE_ADDRESS = optional("GHOSTAI_RISK_ORACLE_ADDRESS", "");

// ─── Token expiry ─────────────────────────────────────────────────────────────
export const TASK_TOKEN_TTL_SECONDS = parseInt(optional("TASK_TOKEN_TTL_SECONDS", "300"), 10);

// ─── Autonomous Code Guardian (ACG) ───────────────────────────────────────────
// GitHub integration (token comes from Vault at runtime; never hardcoded)
export const ACG_GITHUB_TOKEN         = optional("ACG_GITHUB_TOKEN", "");
export const ACG_GITHUB_OWNER         = optional("ACG_GITHUB_OWNER", "ghostchain1");
export const ACG_GITHUB_REPO          = optional("ACG_GITHUB_REPO", "ghostl-stack");
export const ACG_REPO_URL             = optional("ACG_REPO_URL", "https://github.com/ghostchain1/ghostl-stack");
export const ACG_REPO_DEFAULT_BRANCH  = optional("ACG_REPO_DEFAULT_BRANCH", "main");

// Pipeline behaviour
export const ACG_MAX_DEBUG_ITERS      = parseInt(optional("ACG_MAX_DEBUG_ITERS", "3"), 10);
export const ACG_COVERAGE_FLOOR_PCT   = parseFloat(optional("ACG_COVERAGE_FLOOR_PCT", "80"));
export const ACG_FAIL_ON_HIGH         = optional("ACG_FAIL_ON_HIGH", "true") === "true";

// Sentinel thresholds
export const ACG_SENTINEL_WINDOW_SECONDS                  = parseInt(optional("ACG_SENTINEL_WINDOW_SECONDS", "300"), 10);
export const ACG_SENTINEL_ERROR_RATE_ROLLBACK_MULTIPLIER  = parseFloat(optional("ACG_SENTINEL_ERROR_RATE_ROLLBACK_MULTIPLIER", "5"));
export const ACG_SENTINEL_LATENCY_HOTFIX_MULTIPLIER       = parseFloat(optional("ACG_SENTINEL_LATENCY_HOTFIX_MULTIPLIER", "2"));
