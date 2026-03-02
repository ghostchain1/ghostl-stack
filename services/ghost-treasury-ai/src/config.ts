/**
 * config.ts — Environment configuration with Zod validation.
 *
 * All secrets must be injected at runtime via Vault / sealed env.
 * This module redacts sensitive values from structured logs.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  // ─── Network ───────────────────────────────────────────────────────────────
  L1_RPC_URL:  z.string().url(),
  CHAIN_ID_L1: z.coerce.number().int().positive(),

  // ─── Contract addresses (L1) ───────────────────────────────────────────────
  TREASURY_VAULT_ADDRESS:       z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  STRATEGY_REGISTRY_ADDRESS:    z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  RISK_ENGINE_ADDRESS:          z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  TREASURY_GOVERNOR_ADDRESS:    z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  REVENUE_ROUTER_ADDRESS:       z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  PROOF_OF_SOLVENCY_ADDRESS:    z.string().regex(/^0x[0-9a-fA-F]{40}$/),

  // ─── AI Orchestrator signing key (proposer role only — no custody) ─────────
  PROPOSER_PRIVATE_KEY: z.string().min(64),

  // ─── Service ───────────────────────────────────────────────────────────────
  PORT:      z.coerce.number().int().default(7680),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ─── Autonomy tier (0-5; see TreasuryGovernor autonomy spec) ──────────────
  AUTONOMY_TIER: z.coerce.number().int().min(0).max(5).default(1),

  // ─── Shadow mode (proposals submitted but never executed on-chain) ─────────
  SHADOW_MODE: z.coerce.boolean().default(true),

  // ─── Strategy-learning cycle interval (cron-like) ─────────────────────────
  CYCLE_INTERVAL_MS: z.coerce.number().int().min(60_000).default(300_000),

  // ─── Risk thresholds (off-chain soft layer, mirrors on-chain config) ───────
  MIN_STABLE_RESERVE_ETH:  z.coerce.number().default(1000),
  MAX_DAILY_VAR_ETH:       z.coerce.number().default(500),
  AUTO_EXEC_THRESHOLD_ETH: z.coerce.number().default(100),

  // ─── Model registry ────────────────────────────────────────────────────────
  MODEL_REGISTRY_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

let _config: Config | undefined;

export function loadConfig(): Config {
  if (_config) return _config;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`ghost-treasury-ai: invalid environment\n${issues}`);
  }
  _config = result.data;
  return _config;
}

/** Fields that must never appear in logs. */
export const REDACT_KEYS = new Set([
  'PROPOSER_PRIVATE_KEY',
  'L1_RPC_URL', // may contain auth token
]);
