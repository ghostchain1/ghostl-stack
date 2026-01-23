import { readFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('production'),
  PORT: z.coerce.number().default(3220),
  DATABASE_URL: z.string().min(1),
  PIL_ENABLED: z.coerce.boolean().default(false),
  PIL_AUTONOMY_MODE: z.enum(['OBSERVE_ONLY', 'ADVISORY', 'ASSISTED', 'AUTONOMOUS', 'AUTONOMOUS_STRICT']).default('ADVISORY'),
  PIL_WRITE_ENABLED: z.coerce.boolean().default(false),
  PIL_APPROVAL_REQUIRED: z.coerce.boolean().default(true),
  PIL_CHAIN_CONFIG_PATH: z.string().default(path.join(process.cwd(), 'config', 'chains.json')),
  PIL_REGISTRY_URL: z.string().optional(),
  PIL_LEGAL_SIGNALS_PATH: z.string().default(path.join(process.cwd(), 'config', 'legal-signals.json')),
  PIL_JURISDICTIONS_PATH: z.string().default(path.join(process.cwd(), 'config', 'jurisdictions.json')),
  PIL_RPC_NAMESPACE: z.enum(['eth', 'ghost']).optional(),
  PIL_VALIDATOR_CONFIG_PATH: z.string().default(path.join(process.cwd(), 'config', 'validators.json')),
  PIL_VALIDATOR_EVAL_ENABLED: z.coerce.boolean().default(false),
  PIL_VALIDATOR_EVAL_INTERVAL_SECONDS: z.coerce.number().default(300),
  PIL_SIM_ENABLED: z.coerce.boolean().default(false),
  PIL_INGEST_ENABLED: z.coerce.boolean().default(true),
  PIL_INGEST_INTERVAL_SECONDS: z.coerce.number().default(20),
  PIL_MAX_BLOCKS_PER_TICK: z.coerce.number().default(5),
  PIL_RECEIPTS_ENABLED: z.coerce.boolean().default(true),
  PIL_TRACE_ENABLED: z.coerce.boolean().default(false),
  PIL_LOG_LEVEL: z.string().default('info'),
  PIL_SEED_SAMPLE_DATA: z.coerce.boolean().default(true)
});

export type ChainConfig = {
  key: string;
  chainId: number;
  name: string;
  type: 'L1' | 'L2' | 'L3';
  rpcUrl: string;
  gasTokenSymbol: string;
};

const chainsSchema = z.object({
  chains: z.array(
    z.object({
      key: z.string(),
      chainId: z.number().int(),
      name: z.string(),
      type: z.enum(['L1', 'L2', 'L3']),
      rpcUrl: z.string(),
      gasTokenSymbol: z.string()
    })
  )
});

export const config = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    // eslint-disable-next-line no-console
    console.error('Invalid PIL environment configuration', issues);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
})();

const loadChainsFromFile = (): ChainConfig[] => {
  const raw = readFileSync(config.PIL_CHAIN_CONFIG_PATH, 'utf-8');
  const parsed = chainsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('Invalid chains config');
  return parsed.data.chains;
};

const loadChainsFromRegistry = async (): Promise<ChainConfig[] | null> => {
  if (!config.PIL_REGISTRY_URL) return null;
  try {
    const res = await fetch(`${config.PIL_REGISTRY_URL}/v1/endpoints`);
    if (!res.ok) return null;
    const payload = await res.json();
    if (!payload?.chains) return null;
    return payload.chains.map((chain: any) => ({
      key: chain.layer?.toLowerCase() === 'l1' ? 'l1' : chain.layer?.toLowerCase() === 'l2' ? 'l2' : 'l3',
      chainId: chain.chainId,
      name: chain.chainName,
      type: chain.layer,
      rpcUrl: chain.rpc,
      gasTokenSymbol: chain.gasToken || 'GHOST'
    }));
  } catch {
    return null;
  }
};

export const loadChains = async (): Promise<ChainConfig[]> => {
  const registryChains = await loadChainsFromRegistry();
  if (registryChains?.length) return registryChains;
  return loadChainsFromFile();
};
