import { z } from 'zod';
import type { HgEnv } from './types/hgop.js';

const BoolEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'n' || v === 'off' || v === '') return false;
  }
  return value;
}, z.boolean());

const EnvSchema = z.object({
  HG_ENV: z.string().optional(),
  NET_ENV: z.string().optional(),
  HG_BIND: z.string().default('0.0.0.0'),
  HG_PORT: z.coerce.number().int().positive().default(7077),
  HG_DB_PATH: z.string().default('/var/lib/ghost/incident.db'),
  HG_ARTIFACT_DIR: z.string().default('/var/lib/ghost/hgop'),

  HG_DB_MIGRATE: BoolEnv.default(true),
  HG_DB_SEED_DEMO: BoolEnv.default(false),

  HGOP_EXEC_ENABLED: BoolEnv.default(false),
  HGOP_APPROVAL_TOKEN: z.string().optional(),
  HG_ATTESTOR_PRIVATE_KEY: z.string().optional(),

  L1_RPC_URL: z.string().optional(),
  L2_RPC_URL: z.string().optional(),
  L3_RPC_URL: z.string().optional(),

  HG_PROBE_URLS: z.string().optional(),
  HG_PROBE_TIMEOUT_MS: z.coerce.number().int().positive().default(3500),
  HG_PROBE_INTERVAL_MS: z.coerce.number().int().positive().default(15000)
});

export type HgConfig = {
  env: HgEnv;
  bind: string;
  port: number;
  dbPath: string;
  artifactDir: string;
  migrate: boolean;
  seedDemo: boolean;
  execEnabled: boolean;
  approvalToken?: string;
  attestorPrivateKey?: string;
  rpc: { l1?: string; l2?: string; l3?: string };
  probes: { urls: string[]; timeoutMs: number; intervalMs: number };
};

const normalizeEnv = (raw?: string): HgEnv => {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'mainnet' || v === 'prod' || v === 'production') return 'mainnet';
  if (v === 'testnet' || v === 'test' || v === 'staging') return 'testnet';
  if (v === 'devnet' || v === 'dev' || v === 'local') return 'devnet';
  return 'devnet';
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HgConfig {
  const parsed = EnvSchema.parse(env);
  const normalized = normalizeEnv(parsed.HG_ENV || parsed.NET_ENV);
  const urls = (parsed.HG_PROBE_URLS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  return {
    env: normalized,
    bind: parsed.HG_BIND,
    port: parsed.HG_PORT,
    dbPath: parsed.HG_DB_PATH,
    artifactDir: parsed.HG_ARTIFACT_DIR,
    migrate: parsed.HG_DB_MIGRATE,
    seedDemo: parsed.HG_DB_SEED_DEMO,
    execEnabled: parsed.HGOP_EXEC_ENABLED,
    approvalToken: parsed.HGOP_APPROVAL_TOKEN,
    attestorPrivateKey: parsed.HG_ATTESTOR_PRIVATE_KEY,
    rpc: { l1: parsed.L1_RPC_URL, l2: parsed.L2_RPC_URL, l3: parsed.L3_RPC_URL },
    probes: { urls, timeoutMs: parsed.HG_PROBE_TIMEOUT_MS, intervalMs: parsed.HG_PROBE_INTERVAL_MS }
  };
}
