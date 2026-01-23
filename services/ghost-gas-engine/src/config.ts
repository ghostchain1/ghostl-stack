import { readFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('production'),
  PORT: z.coerce.number().default(3210),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://redis:6379'),
  CHAINS_CONFIG_PATH: z.string().default(path.join(process.cwd(), 'config', 'chains.json')),
  POLICIES_PATH: z.string().default(path.join(process.cwd(), 'config', 'gas-policies.json')),
  GHOST_RPC_NAMESPACE: z.enum(['auto', 'eth', 'ghost']).default('auto'),
  RPC_L1: z.string().optional(),
  RPC_L2: z.string().optional(),
  RPC_L3: z.string().optional(),
  GAS_TOKEN_L1: z.string().optional(),
  GAS_TOKEN_L2: z.string().optional(),
  GAS_TOKEN_L3: z.string().optional(),
  SIGNER_PRIVATE_KEY: z.string().optional(),
  SIGNER_PRIVATE_KEY_L1: z.string().optional(),
  SIGNER_PRIVATE_KEY_L2: z.string().optional(),
  SIGNER_PRIVATE_KEY_L3: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),
  MAX_RETRIES: z.coerce.number().default(5),
  RETRY_BACKOFF_MS: z.coerce.number().default(1500),
  RETRY_MULTIPLIER_STEP: z.coerce.number().default(1.25),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(15000),
  LOG_LEVEL: z.string().default('info'),
  AUTONOMY_ENABLED: z.coerce.boolean().default(true),
  AUTONOMY_MODE: z
    .enum(['OBSERVE_ONLY', 'ADVISORY', 'ASSISTED', 'AUTONOMOUS', 'AUTONOMOUS_STRICT', 'DRY_RUN'])
    .default('ASSISTED'),
  AUTONOMY_MAX_RISK: z.coerce.number().min(0).max(1).default(0.65),
  AUTONOMY_MAX_GAS: z.coerce.number().default(30_000_000),
  AUTONOMY_MAX_RETRIES: z.coerce.number().default(5),
  AUTONOMY_POLICY_LOCK: z.coerce.boolean().default(false),
  AUTONOMY_POLICY_MAX_DELTA: z.coerce.number().default(0.08),
  AUTONOMY_FORECAST_INTERVAL_SECONDS: z.coerce.number().default(120)
});

export type ChainConfig = {
  key: string;
  chainId: number;
  name: string;
  type: 'L1' | 'L2' | 'L3';
  rpcUrl: string;
  wsUrl?: string;
  gasTokenSymbol: string;
  fallbackRpcUrls?: string[];
};

export type GasPolicy = {
  chainKey: string;
  chainId: number;
  chainName: string;
  chainType: 'L1' | 'L2' | 'L3';
  gasTokenSymbol: string;
  version: string;
  baseMultiplier: number;
  maxGasLimit: number;
  safetyMarginPercent: number;
  retry: {
    maxRetries: number;
    backoffMs: number;
    multiplierStep: number;
  };
  sequencerAware: boolean;
};

const chainsSchema = z.object({
  chains: z.array(
    z.object({
      key: z.string(),
      chainId: z.number().int(),
      name: z.string(),
      type: z.enum(['L1', 'L2', 'L3']),
      rpcUrl: z.string(),
      wsUrl: z.string().optional(),
      gasTokenSymbol: z.string(),
      fallbackRpcUrls: z.array(z.string()).optional()
    })
  )
});

const policiesSchema = z.object({
  policies: z.array(
    z.object({
      chainKey: z.string(),
      chainId: z.number(),
      chainName: z.string(),
      chainType: z.enum(['L1', 'L2', 'L3']),
      gasTokenSymbol: z.string(),
      version: z.string(),
      baseMultiplier: z.number(),
      maxGasLimit: z.number(),
      safetyMarginPercent: z.number(),
      retry: z.object({
        maxRetries: z.number(),
        backoffMs: z.number(),
        multiplierStep: z.number()
      }),
      sequencerAware: z.boolean()
    })
  )
});

export const config = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration', issues);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
})();

const applyEnvOverrides = (chains: ChainConfig[]): ChainConfig[] => {
  return chains.map((chain) => {
    const key = chain.key.toLowerCase();
    if (key === 'l1' && config.RPC_L1) chain.rpcUrl = config.RPC_L1;
    if (key === 'l2' && config.RPC_L2) chain.rpcUrl = config.RPC_L2;
    if (key === 'l3' && config.RPC_L3) chain.rpcUrl = config.RPC_L3;
    if (key === 'l1' && config.GAS_TOKEN_L1) chain.gasTokenSymbol = config.GAS_TOKEN_L1;
    if (key === 'l2' && config.GAS_TOKEN_L2) chain.gasTokenSymbol = config.GAS_TOKEN_L2;
    if (key === 'l3' && config.GAS_TOKEN_L3) chain.gasTokenSymbol = config.GAS_TOKEN_L3;
    return chain;
  });
};

export const loadChains = (): ChainConfig[] => {
  const raw = readFileSync(config.CHAINS_CONFIG_PATH, 'utf-8');
  const parsed = chainsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error('Invalid chains config');
  }
  return applyEnvOverrides(parsed.data.chains);
};

export const loadPolicies = (): GasPolicy[] => {
  const raw = readFileSync(config.POLICIES_PATH, 'utf-8');
  const parsed = policiesSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error('Invalid gas policies config');
  }
  return parsed.data.policies;
};

export const signerForChain = (chainKey: string): string | undefined => {
  const key = chainKey.toLowerCase();
  if (key === 'l1' && config.SIGNER_PRIVATE_KEY_L1) return config.SIGNER_PRIVATE_KEY_L1;
  if (key === 'l2' && config.SIGNER_PRIVATE_KEY_L2) return config.SIGNER_PRIVATE_KEY_L2;
  if (key === 'l3' && config.SIGNER_PRIVATE_KEY_L3) return config.SIGNER_PRIVATE_KEY_L3;
  return config.SIGNER_PRIVATE_KEY;
};
