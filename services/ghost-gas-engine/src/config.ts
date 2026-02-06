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
  GHOST_RPC_NAMESPACE: z.enum(['auto', 'evm', 'ghost', 'eth']).default('auto'),
  RPC_L1: z.string().optional(),
  RPC_L2: z.string().optional(),
  RPC_L3: z.string().optional(),
  CANONICAL_GAS_TOKEN_ADDRESS: z.string().default('0x5FbDB2315678afecb367f032d93F642f64180aa3'),
  GAS_TOKEN_ADDRESS: z.string().optional(),
  GAS_TOKEN_ADDRESS_L1: z.string().optional(),
  GAS_TOKEN_ADDRESS_L2: z.string().optional(),
  GAS_TOKEN_ADDRESS_L3: z.string().optional(),
  GAS_TOKEN_L1: z.string().optional(),
  GAS_TOKEN_L2: z.string().optional(),
  GAS_TOKEN_L3: z.string().optional(),
  FEE_WATCHER_ENABLED: z.coerce.boolean().default(true),
  FEE_WATCHER_INTERVAL_SECONDS: z.coerce.number().default(30),
  FEE_WATCHER_WINDOW_SIZE: z.coerce.number().default(40),
  FEE_WATCHER_SAFE_MODE: z.coerce.boolean().default(true),
  FEE_POLICY_CONTRACT_L1: z.string().optional(),
  FEE_POLICY_CONTRACT_L2: z.string().optional(),
  FEE_POLICY_CONTRACT_L3: z.string().optional(),
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
  AUTONOMY_FORECAST_INTERVAL_SECONDS: z.coerce.number().default(120),
  AI_EVIDENCE_OUTPUT_DIR: z.string().optional(),
  AI_EVIDENCE_AUTO_COMMIT: z.coerce.boolean().default(false),
  AI_EVIDENCE_KIND: z.string().default('ghost.ai.policy'),
  AI_EVIDENCE_VAULT_ADDRESS: z.string().optional(),
  AI_EVIDENCE_VAULT_RPC: z.string().optional(),
  AI_EVIDENCE_SUBMITTER_KEY: z.string().optional(),
  AI_EVIDENCE_SIGNER_SET_HASH: z.string().optional(),
  AI_EVIDENCE_THRESHOLD: z.coerce.number().default(1),
  AI_POLICY_REGISTRY_ADDRESS: z.string().optional(),
  AI_POLICY_REGISTRY_RPC: z.string().optional(),
  AI_PROPOSAL_EXECUTOR_ADDRESS: z.string().optional(),
  AI_PROPOSAL_EXECUTOR_RPC: z.string().optional(),
  AI_PROPOSAL_SIGNER_KEYS: z.string().optional(),
  AI_PROPOSAL_MIN_SIGNATURES: z.coerce.number().default(0),
  AI_PROPOSAL_AUTO_SUBMIT: z.coerce.boolean().default(false),
  AI_PROPOSAL_SUBMITTER_KEY: z.string().optional(),
  AI_POLICY_UPDATE_TTL_SECONDS: z.coerce.number().default(3600),
  AI_PROPOSAL_OUTPUT_DIR: z.string().optional(),
  CHAIN_POLICY_REQUIRED: z.coerce.boolean().default(false),
  CHAIN_POLICY_CHECKPOINT_HASH: z.string().optional(),
  CHAIN_POLICY_CHECKPOINT_LAYER: z.string().default('L1'),
  CHAIN_POLICY_REGISTRY_ADDRESS: z.string().optional()
});

const CANONICAL_GAS_TOKEN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CANONICAL_GAS_TOKEN_SYMBOL = 'GHOST';
const CANONICAL_GAS_TOKEN_NAME = 'Ghost Token';
const CANONICAL_GAS_TOKEN_DECIMALS = 18;

const requireCanonicalAddress = (value: string | undefined, label: string) => {
  const configured = value || config.CANONICAL_GAS_TOKEN_ADDRESS || CANONICAL_GAS_TOKEN_ADDRESS;
  if (configured.toLowerCase() !== CANONICAL_GAS_TOKEN_ADDRESS.toLowerCase()) {
    throw new Error(`${label} must be ${CANONICAL_GAS_TOKEN_ADDRESS}`);
  }
  return CANONICAL_GAS_TOKEN_ADDRESS;
};

const requireCanonicalSymbol = (value: string | undefined, label: string) => {
  const configured = value || CANONICAL_GAS_TOKEN_SYMBOL;
  if (configured !== CANONICAL_GAS_TOKEN_SYMBOL) {
    throw new Error(`${label} must be ${CANONICAL_GAS_TOKEN_SYMBOL}`);
  }
  return CANONICAL_GAS_TOKEN_SYMBOL;
};

export type ChainConfig = {
  key: string;
  chainId: number;
  name: string;
  type: 'L1' | 'L2' | 'L3';
  rpcUrl: string;
  wsUrl?: string;
  gasTokenSymbol: string;
  gasTokenAddress: string;
  gasTokenName?: string;
  gasTokenDecimals?: number;
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
      gasTokenAddress: z.string(),
      gasTokenName: z.string().optional(),
      gasTokenDecimals: z.number().int().optional(),
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
  const data = parsed.data;
  const normalizedRpcNamespace = data.GHOST_RPC_NAMESPACE === 'evm' ? 'eth' : data.GHOST_RPC_NAMESPACE;
  return {
    ...data,
    GHOST_RPC_NAMESPACE: normalizedRpcNamespace as 'auto' | 'eth' | 'ghost'
  };
})();

const applyEnvOverrides = (chains: ChainConfig[]): ChainConfig[] => {
  const canonicalAddress = requireCanonicalAddress(config.GAS_TOKEN_ADDRESS, 'GAS_TOKEN_ADDRESS');
  requireCanonicalAddress(config.GAS_TOKEN_ADDRESS_L1, 'GAS_TOKEN_ADDRESS_L1');
  requireCanonicalAddress(config.GAS_TOKEN_ADDRESS_L2, 'GAS_TOKEN_ADDRESS_L2');
  requireCanonicalAddress(config.GAS_TOKEN_ADDRESS_L3, 'GAS_TOKEN_ADDRESS_L3');
  return chains.map((chain) => {
    const key = chain.key.toLowerCase();
    if (key === 'l1' && config.RPC_L1) chain.rpcUrl = config.RPC_L1;
    if (key === 'l2' && config.RPC_L2) chain.rpcUrl = config.RPC_L2;
    if (key === 'l3' && config.RPC_L3) chain.rpcUrl = config.RPC_L3;
    if (key === 'l1') chain.gasTokenSymbol = requireCanonicalSymbol(config.GAS_TOKEN_L1, 'GAS_TOKEN_L1');
    if (key === 'l2') chain.gasTokenSymbol = requireCanonicalSymbol(config.GAS_TOKEN_L2, 'GAS_TOKEN_L2');
    if (key === 'l3') chain.gasTokenSymbol = requireCanonicalSymbol(config.GAS_TOKEN_L3, 'GAS_TOKEN_L3');
    if (chain.gasTokenSymbol !== CANONICAL_GAS_TOKEN_SYMBOL) {
      throw new Error(`gasTokenSymbol must be ${CANONICAL_GAS_TOKEN_SYMBOL} for ${chain.key}`);
    }
    if (chain.gasTokenAddress.toLowerCase() !== CANONICAL_GAS_TOKEN_ADDRESS.toLowerCase()) {
      throw new Error(`gasTokenAddress must be ${CANONICAL_GAS_TOKEN_ADDRESS} for ${chain.key}`);
    }
    chain.gasTokenAddress = canonicalAddress;
    chain.gasTokenName = CANONICAL_GAS_TOKEN_NAME;
    chain.gasTokenDecimals = CANONICAL_GAS_TOKEN_DECIMALS;
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
