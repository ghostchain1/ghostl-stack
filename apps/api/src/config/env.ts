import path from 'path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: path.join(process.cwd(), '.env.local') });

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
  GUARD_ADMIN_TOKEN: z.string().optional(),
  LOKI_URL: z.string().url().optional(),
  ALERTMANAGER_URL: z.string().url().optional(),
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
  CONTRACT_RPC_URL: z.string().url().optional(),
  CONTRACT_TARGET_ADDRESS: z.string().optional(),
  CONTRACT_PROXY_ADMIN_ADDRESS: z.string().optional(),
  GOVERNANCE_CONTRACT_ADDRESS: z.string().optional(),
  STAKING_CONTRACT_ADDRESS: z.string().optional(),
  SUPPLY_SERVICE_URL: z.string().url().default('http://localhost:7614'),
  FEE_MODEL_SERVICE_URL: z.string().url().default('http://localhost:7615'),
  TREASURY_SERVICE_URL: z.string().url().default('http://localhost:7628'),
  PAYOUT_SERVICE_URL: z.string().url().default('http://localhost:7629'),
  TREASURY_MULTISIG_THRESHOLD: z.coerce.number().int().min(1).max(10).default(2),
  TREASURY_MULTISIG_SIGNERS: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ALERT_WEBHOOK_SECRET: z.string().optional(),
  BRIDGE_ADDRESS: z.string().optional(),
  BRIDGE_L2L3_ADDRESS: z.string().optional(),
  L1_ROLLUP_L2_ADDRESS: z.string().optional(),
  L2_ROLLUP_L3_ADDRESS: z.string().optional(),
  L3_INBOX_ADDRESS: z.string().optional(),
  EMAIL_SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_TO: z.string().email().optional(),
  EXECUTION_APPROVAL_TOKEN: z.string().optional(),
  EXECUTION_ALLOWLIST: z.string().optional(),
  EXECUTION_MAX_ACTIONS: z.coerce.number().int().min(1).max(50).default(10),
  EXECUTION_DRY_RUN_TTL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(10 * 60 * 1000),
  GOVERNANCE_SERVICE_URL: z.string().url().default('http://localhost:7645'),
  VALIDATOR_SERVICE_URL: z.string().url().default('http://localhost:7607'),
  DEVOPS_SERVICE_URL: z.string().url().default('http://localhost:7623'),
  RPC_SERVICE_URL: z.string().url().default('http://localhost:7650'),
  USAGE_SERVICE_URL: z.string().url().default('http://localhost:7651'),
  WEBHOOKS_SERVICE_URL: z.string().url().default('http://localhost:7652'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:7616'),
  FORECASTING_SERVICE_URL: z.string().url().default('http://localhost:7617'),
  EXPLAINABILITY_SERVICE_URL: z.string().url().default('http://localhost:7632'),
  EXPLORER_RPC_URL: z.string().url().optional(),
  RPC_L1: z.string().url().optional(),
  RPC_L2: z.string().url().optional(),
  RPC_L3: z.string().url().optional(),
  RPC_REGISTRY_URL: z.string().url().default('https://rpc.ghostchain.cloud/v1/endpoints'),
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
  VAULT_ADDR: z.string().url().optional(),
  VAULT_HEALTH_URL: z.string().optional(),
  VAULT_TOKEN: z.string().optional(),
  HARDWARE_WALLET_REQUIRED: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  KYC_PROVIDER_NAME: z.string().optional(),
  KYC_PROVIDER_URL: z.string().url().optional(),
  KYC_PROVIDER_STATUS: z.enum(['connected', 'pending', 'error']).optional(),
  KYC_STORE_PATH: z.string().optional(),
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
  GHOSTWALLET_FUNDER_CHAIN: z.enum(['l1', 'l2', 'l3']).optional()
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast to avoid booting without required env
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
