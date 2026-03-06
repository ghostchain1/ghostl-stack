/**
 * governance-event-bridge — Configuration
 *
 * All settings are drawn from environment variables so the service can be
 * configured identically via docker-compose, Kubernetes, or a bare .env
 * without any code changes.
 */

import { z } from "zod";

const Env = z.object({
  // ── Chain RPC endpoints ────────────────────────────────────────────────────
  RPC_L1: z.string().url().default("http://localhost:18545"),
  RPC_L2: z.string().url().default("http://localhost:29547"),

  // ── Governor contract addresses per layer (empty = skip that layer) ────────
  GOVERNOR_ADDRESS_L1: z.string().default(""),
  GOVERNOR_ADDRESS_L2: z.string().default(""),

  // ── ghostbrain-core signal endpoint ───────────────────────────────────────
  GHOSTBRAIN_URL: z.string().url().default("http://localhost:7700"),

  // ── HMAC auth shared with ghostbrain-core ─────────────────────────────────
  CONTROL_PLANE_HMAC_SECRET: z.string().default(""),

  // ── Polling interval (milliseconds) ───────────────────────────────────────
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(6_000),

  // ── Block-range cap: how many blocks to request in a single eth_getLogs ───
  LOG_BLOCK_RANGE: z.coerce.number().int().positive().default(500),

  // ── State file for persisting the last processed block per layer ──────────
  STATE_FILE: z.string().default("/var/lib/governance-event-bridge/state.json"),

  // ── Starting block to use when no state exists (0 = chain genesis) ────────
  START_BLOCK_L1: z.coerce.number().int().nonnegative().default(0),
  START_BLOCK_L2: z.coerce.number().int().nonnegative().default(0),

  // ── Log level ─────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(): Config {
  const result = Env.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `governance-event-bridge: invalid config\n${result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  return result.data;
}
