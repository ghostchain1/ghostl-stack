/**
 * GhostContractAI — Configuration
 *
 * All secrets are consumed from environment variables.
 * NO key material is ever logged.
 */

// ─── Chain routing topology ─────────────────────────────────────────────────
export const CHAIN_IDS = {
  L1: Number(process.env.GHOSTAI_L1_CHAIN_ID ?? 1),
  L2: Number(process.env.GHOSTAI_L2_CHAIN_ID ?? 10),
  L3: Number(process.env.GHOSTAI_L3_CHAIN_ID ?? 100),
} as const satisfies Record<string, number>;

// ─── RPC endpoints ──────────────────────────────────────────────────────────
export const RPC_URLS = {
  L1: process.env.GHOSTAI_L1_RPC_URL ?? "http://ghostchain-rpc:8545",
  L2: process.env.GHOSTAI_L2_RPC_URL ?? "http://ghostl2-rpc:9545",
  L3: process.env.GHOSTAI_L3_RPC_URL ?? "http://ghostl3-rpc:9546",
} as const satisfies Record<string, string>;

// ─── On-chain contract addresses ─────────────────────────────────────────────
export const CONTRACT_ADDRESSES = {
  registry:  process.env.GHOSTAI_REGISTRY_ADDR  ?? "",
  governor:  process.env.GHOSTAI_GOVERNOR_ADDR  ?? "",
  policyGate: process.env.GHOSTAI_POLICYGATE_ADDR ?? "",
  riskOracle: process.env.GHOSTAI_RISKORACLE_ADDR ?? "",
} as const satisfies Record<string, string>;

// ─── Vault / signing ────────────────────────────────────────────────────────
// Key is loaded from Vault or env — NEVER printed to logs.
export const VAULT_ADDR   = process.env.GHOSTAI_VAULT_ADDR ?? "";
export const VAULT_TOKEN  = process.env.GHOSTAI_VAULT_TOKEN ?? "";   // never logged
export const VAULT_SECRET_PATH = process.env.GHOSTAI_VAULT_SECRET_PATH ?? "secret/ghostcontract-ai/signer";

// ─── Service runtime ────────────────────────────────────────────────────────
export const PORT        = Number(process.env.PORT ?? 7610);
export const ENV         = (process.env.NODE_ENV ?? "development") as "production" | "testnet" | "devnet" | "development";
export const DRY_RUN     = process.env.GHOSTAI_DRY_RUN !== "false";  // default true
export const SERVICE_NAME = "ghostcontract-ai";

// ─── Pipeline limits ────────────────────────────────────────────────────────
export const MAX_CONCURRENT_PIPELINES = Number(process.env.GHOSTAI_MAX_PIPELINES ?? 4);
export const PIPELINE_TIMEOUT_MS      = Number(process.env.GHOSTAI_PIPELINE_TIMEOUT_MS ?? 300_000); // 5 min

// ─── Risk thresholds ────────────────────────────────────────────────────────
export const RISK_QUARANTINE_THRESHOLD = Number(process.env.GHOSTAI_QUARANTINE_THRESHOLD ?? 70);
export const RISK_HIGH_THRESHOLD       = Number(process.env.GHOSTAI_HIGH_RISK_THRESHOLD ?? 50);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const JWT_ISSUER   = process.env.GHOSTAI_JWT_ISSUER ?? "";
export const JWT_AUDIENCE = process.env.GHOSTAI_JWT_AUDIENCE ?? "ghostcontract-ai";

// ─── Observability ──────────────────────────────────────────────────────────
export const REGISTRY_URL = process.env.RPC_REGISTRY_URL ?? "http://ghost-registry:8088/v1/endpoints";

// ─── Foundry workspace ──────────────────────────────────────────────────────
export const CONTRACTS_DIR   = process.env.GHOSTAI_CONTRACTS_DIR ?? "/app/contracts";
export const FOUNDRY_PROFILE = process.env.FOUNDRY_PROFILE ?? "default";

// ─── Slither ─────────────────────────────────────────────────────────────────
export const SLITHER_BIN = process.env.SLITHER_BIN ?? "slither";
