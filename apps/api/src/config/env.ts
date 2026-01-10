import { z } from 'zod';

const EnvSchema = z.object({
  SESSION_SECRET: z.string().min(1).default('dev-secret'),
  SESSION_STORE_PATH: z.string().default('.sessions'),
  PROMETHEUS_URL: z.string().url().default('http://localhost:9090'),
  GRAFANA_URL: z.string().url().default('http://localhost:3000'),
  GRAFANA_API_KEY: z.string().optional(),
  RELAYER_URL: z.string().url().default('http://localhost:7171'),
  GUARD_URL: z.string().url().default('http://localhost:7070'),
  GUARD_ADMIN_TOKEN: z.string().optional(),
  LOKI_URL: z.string().url().optional(),
  ALERTMANAGER_URL: z.string().url().optional(),
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
  SUPPLY_SERVICE_URL: z.string().url().default('http://localhost:7614'),
  FEE_MODEL_SERVICE_URL: z.string().url().default('http://localhost:7615'),
  TREASURY_SERVICE_URL: z.string().url().default('http://localhost:7628'),
  PAYOUT_SERVICE_URL: z.string().url().default('http://localhost:7629'),
  TREASURY_MULTISIG_THRESHOLD: z.coerce.number().int().min(1).max(10).default(2),
  TREASURY_MULTISIG_SIGNERS: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  EMAIL_SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_TO: z.string().email().optional(),
  GOVERNANCE_SERVICE_URL: z.string().url().default('http://localhost:7645'),
  VALIDATOR_SERVICE_URL: z.string().url().default('http://localhost:7607'),
  DEVOPS_SERVICE_URL: z.string().url().default('http://localhost:7623'),
  RPC_SERVICE_URL: z.string().url().default('http://localhost:7650'),
  USAGE_SERVICE_URL: z.string().url().default('http://localhost:7651'),
  WEBHOOKS_SERVICE_URL: z.string().url().default('http://localhost:7652'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:7660'),
  EXPLORER_RPC_URL: z.string().url().optional(),
  RPC_L2: z.string().url().optional(),
  SWAP_SERVICE_URL: z.string().url().default('http://localhost:7670'),
  BRIDGE_ADMIN_TOKEN: z.string().optional(),
  CHAIN_ID: z.string().optional(),
  CHAIN_NAME: z.string().optional(),
  CHAIN_ENV: z.string().optional(),
  CONSENSUS: z.string().optional(),
  PROM_MISSED_BLOCKS_QUERY: z.string().optional(),
  PROM_FINALITY_LAG_QUERY: z.string().optional()
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast to avoid booting without required env
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
