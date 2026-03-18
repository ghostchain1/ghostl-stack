import path from 'path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: path.join(process.cwd(), '.env.local') });

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const EnvSchema = z.object({
  SESSION_SECRET: z.string().min(1).default('dev-secret'),
  SESSION_STORE_PATH: z.string().default('.sessions'),
  AUTH_DB_PATH: z.string().optional(),
  SESSION_TTL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(30 * 60 * 1000),
  SETUP_TOKEN: z.string().optional(),
  PROMETHEUS_URL: z.string().url().default('http://localhost:9090'),
  GRAFANA_URL: z.string().url().default('http://localhost:3000'),
  GRAFANA_API_KEY: z.string().optional(),
  RELAYER_URL: z.string().url().default('http://localhost:7171'),
  GUARD_URL: z.string().url().default('http://localhost:7070'),
  GAS_ENGINE_URL: z.string().url().default('http://localhost:3210'),
  GUARD_ADMIN_TOKEN: z.string().optional(),
  LOKI_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ALERTMANAGER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OBSERVABILITY_CRITICAL_LOG_PATH: z.string().default('./data/critical-logs.jsonl'),
  OBSERVABILITY_CRITICAL_LOG_SECRET: z.string().optional(),
  OBSERVABILITY_LOG_MAX_LIMIT: z.coerce.number().int().min(50).max(5000).default(500),
  PUBLIC_OBSERVABILITY: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  PUBLIC_CHAIN: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  PUBLIC_NODES: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  PUBLIC_VALIDATORS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  PUBLIC_EXPLORER: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  PUBLIC_STACK: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  BRIDGE_SERVICE_URL: z.string().url().default('http://localhost:7604'),
  TRANSFER_SERVICE_URL: z.string().url().default('http://localhost:7605'),
  LIQUIDITY_SERVICE_URL: z.string().url().default('http://localhost:7606'),
  CONTRACT_REGISTRY_URL: z.string().url().default('http://localhost:7608'),
  CONTRACT_RISK_URL: z.string().url().default('http://localhost:7609'),
  CONTRACT_UPGRADEABILITY_QUERY: z.string().optional(),
  CONTRACT_PAUSE_QUERY: z.string().optional(),
  CONTRACT_STATE_FILE: z.string().optional(),
  CONTRACT_ADMIN_KEY: z.string().optional(),
  CONTRACT_RPC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  CONTRACT_CHAIN: z.enum(['l1', 'l2', 'l3']).default('l2'),
  CONTRACT_TARGET_ADDRESS: z.string().optional(),
  CONTRACT_PROXY_ADMIN_ADDRESS: z.string().optional(),
  GOVERNANCE_CONTRACT_ADDRESS: z.string().optional(),
  STAKING_CONTRACT_ADDRESS: z.string().optional(),
  SUPPLY_SERVICE_URL: z.string().url().default('http://localhost:7614'),
  FEE_MODEL_SERVICE_URL: z.string().url().default('http://localhost:7615'),
  TREASURY_SERVICE_URL: z.string().url().default('http://localhost:7628'),
  PAYOUT_SERVICE_URL: z.string().url().default('http://localhost:7629'),
  L3_FEE_COLLECTOR_URL: z.string().url().default('http://localhost:7681'),
  L2_REVENUE_AGGREGATOR_URL: z.string().url().default('http://localhost:7682'),
  TREASURY_ENGINE_URL: z.string().url().default('http://localhost:7683'),
  REWARD_DISTRIBUTOR_URL: z.string().url().default('http://localhost:7684'),
  HYPER_GHOST_GOVERNOR_URL: z.string().url().default('http://localhost:7685'),
  TREASURY_MULTISIG_THRESHOLD: z.coerce.number().int().min(1).max(10).default(2),
  TREASURY_MULTISIG_SIGNERS: z.string().optional(),
  SLACK_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  DISCORD_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ALERT_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ALERT_WEBHOOK_SECRET: z.string().optional(),
  BRIDGE_ADDRESS: z.string().optional(),
  BRIDGE_L2L3_ADDRESS: z.string().optional(),
  L1_ROLLUP_L2_ADDRESS: z.string().optional(),
  L2_ROLLUP_L3_ADDRESS: z.string().optional(),
  L3_INBOX_ADDRESS: z.string().optional(),
  EMAIL_SMTP_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().email().optional()),
  EMAIL_TO: z.preprocess(emptyToUndefined, z.string().email().optional()),
  EXECUTION_APPROVAL_TOKEN: z.string().optional(),
  EXECUTION_ALLOWLIST: z.string().optional(),
  EXECUTION_MAX_ACTIONS: z.coerce.number().int().min(1).max(50).default(10),
  EXECUTION_DRY_RUN_TTL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(10 * 60 * 1000),
  GOVERNANCE_SERVICE_URL: z.string().url().default('http://localhost:7645'),
  VALIDATOR_SERVICE_URL: z.string().url().default('http://localhost:7607'),
  DEVOPS_SERVICE_URL: z.string().url().default('http://localhost:7623'),
  USAGE_SERVICE_URL: z.string().url().default('http://localhost:7651'),
  WEBHOOKS_SERVICE_URL: z.string().url().default('http://localhost:7652'),
  NOTIFICATIONS_SERVICE_URL: z.string().url().default('http://localhost:7638'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:7616'),
  FORECASTING_SERVICE_URL: z.string().url().default('http://localhost:7617'),
  EXPLAINABILITY_SERVICE_URL: z.string().url().default('http://localhost:7632'),
  RPC_REGISTRY_URL: z.string().url().default('http://ghost-registry:8088/v1/endpoints'),
  MAINNET_LAUNCH_GATE_ADDRESS: z.string().optional(),
  MAINNET_RELEASE_GATE_ADDRESS: z.string().optional(),
  RELEASE_MANIFEST_PATH: z.string().default('artifacts/release/release_manifest.json'),
  RELEASE_ATTESTATION_PATH: z.string().default('artifacts/release/release_manifest.sig'),
  RELEASE_ATTESTATION_PUBLIC_KEY_PATH: z.string().default('artifacts/release/release_manifest.pub'),
  CONSTITUTION_DOC_PATH: z.string().default('docs/constitution/GhostChain-Constitution.md'),
  GOVERNANCE_PROPOSAL_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  SWAP_SERVICE_URL: z.string().url().default('http://localhost:7670'),
  BRIDGE_ADMIN_TOKEN: z.string().optional(),
  CHAIN_ID: z.string().optional(),
  CHAIN_NAME: z.string().optional(),
  CHAIN_ENV: z.string().optional(),
  CONSENSUS: z.string().optional(),
  PROM_MISSED_BLOCKS_QUERY: z.string().optional(),
  PROM_FINALITY_LAG_QUERY: z.string().optional(),
  PROM_PARTICIPATION_QUERY: z.string().optional(),
  PROM_PROPOSER_QUERY: z.string().optional(),
  PROM_LATENCY_P50_QUERY: z.string().optional(),
  EXPECTED_NODE_VERSION: z.string().optional(),
  GAS_PRICE_MODEL: z.string().optional(),
  SNAPSHOT_SPACE: z.string().optional(),
  SNAPSHOT_API_URL: z.string().optional(),
  FORUM_URL: z.string().optional(),
  VAULT_ADDR: z.preprocess(emptyToUndefined, z.string().url().optional()),
  VAULT_HEALTH_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  VAULT_TOKEN: z.string().optional(),
  VAULT_AUTH_PATH: z.string().default('auth/approle/login'),
  VAULT_ROLE_ID: z.string().optional(),
  VAULT_SECRET_ID: z.string().optional(),
  VAULT_NAMESPACE: z.string().optional(),
  HARDWARE_WALLET_REQUIRED: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  KYC_PROVIDER_NAME: z.string().optional(),
  KYC_PROVIDER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  KYC_PROVIDER_STATUS: z.enum(['connected', 'pending', 'error']).optional(),
  KYC_STORE_PATH: z.string().optional(),
  NFT_STORE_PATH: z.string().optional(),
  NFT_DB_PATH: z.string().optional(),
  MARKET_DATA_FILE: z.string().optional(),
  MARKET_DEFAULT_TOKENS: z.string().optional(),
  INTEGRATIONS_STORE_PATH: z.string().optional(),
  INTEGRATIONS_MASTER_KEY: z.string().optional(),
  GHOSTWALLET_MASTER_KEY: z.string().min(1),
  GHOSTWALLET_DERIVATION_PATH: z.string().optional(),
  ALLOW_PUBLIC_SIGNUP: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  OWNER_EMAILS: z.string().optional(),
  BOOTSTRAP_OWNER_EMAILS: z.string().optional(),
  BOOTSTRAP_OWNER_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  AUTH_JWT_SECRET: z.string().optional(),
  GHOSTWALLET_FUNDER_PRIVATE_KEY: z.string().optional(),
  GHOSTWALLET_FUNDER_CHAIN: z.enum(['l1', 'l2', 'l3']).optional(),

  // ─── OIDC / Realm SSO ────────────────────────────────────────────────────
  /** Keycloak base URL, e.g. https://keycloak.ghost.example */
  KEYCLOAK_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  KEYCLOAK_REALM_USERS: z.string().default('ghost-users'),
  KEYCLOAK_REALM_EMPLOYEES: z.string().default('ghost-employees'),
  KEYCLOAK_REALM_ADMINS: z.string().default('ghost-admins'),
  /** Override issuer URLs (auto-derived from KEYCLOAK_BASE_URL if not set) */
  OIDC_ISSUER_USERS: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OIDC_ISSUER_EMPLOYEES: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OIDC_ISSUER_ADMINS: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** JWT audience claim(s) expected by this service (comma-separated) */
  OIDC_AUDIENCE: z.string().optional(),
  /** Clock tolerance in seconds for JWT expiry validation */
  OIDC_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(300).default(5),
  /** URL of ghost-jwks-guard or JWKS proxy (uses Keycloak JWKS endpoints when not set) */
  JWKS_GUARD_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  // ─── OIDC Authorization-Code / PKCE (BFF-side flow) ─────────────────────
  /** Keycloak client ID for the users realm public client */
  OIDC_CLIENT_ID_USERS: z.string().default('ghost-app'),
  /** Keycloak client ID for the employees realm public client */
  OIDC_CLIENT_ID_EMPLOYEES: z.string().default('ghost-employees-app'),
  /** Keycloak client ID for the admins realm public client */
  OIDC_CLIENT_ID_ADMINS: z.string().default('ghost-admins-app'),
  /**
   * Absolute redirect URI registered in Keycloak for the auth-code callback.
   * Must end without a trailing slash.
   * Example: https://api.ghost.example/auth/oidc/callback
   */
  OIDC_REDIRECT_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /**
   * Comma-separated list of origin prefixes that are allowed as the
   * post-login redirect target (open-redirect guard).
   * Defaults to CORS_ALLOWED_ORIGINS when not set.
   */
  OIDC_ALLOWED_REDIRECT_ORIGINS: z.string().optional(),

  // ─── Gateway policy ──────────────────────────────────────────────────────
  /**
   * Comma-separated list of origins allowed for CORS (validated at startup).
   * Empty = allow all in dev, deny all non-same-origin in production.
   */
  /** GhostBrain Orchestrator service URL (port 7895). */
  GHOSTBRAIN_ORCHESTRATOR_URL: z.string().url().default('http://localhost:7895'),
  CORS_ALLOW_ORIGINS: z.string().default(''),
  /** Rate-limit sliding window duration in ms (default: 1 min). */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  /** Max requests per IP/session per window (global — all routes). */
  RATE_LIMIT_MAX_GLOBAL: z.coerce.number().int().min(10).max(10_000).default(600),
  /** Max requests per IP per window on auth paths (stricter). */
  RATE_LIMIT_MAX_AUTH: z.coerce.number().int().min(5).max(500).default(30)
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast to avoid booting without required env
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
