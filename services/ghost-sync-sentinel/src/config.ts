import { z } from "zod";

const schema = z.object({
  PORT: z.string().default("8787"),
  LOG_LEVEL: z.string().default("info"),

  // RPCs
  // L1: standard eth JSON-RPC (l1-rpc-proxy:18546 in opstack network)
  L1_RPC_URL: z.string().url(),
  // L2: OP Stack rollup RPC (op-node:9546) — supports rollup_syncStatus
  L2_RPC_URL: z.string().url(),
  // L3: OP Stack rollup RPC (l3-op-node:19546) — supports rollup_syncStatus
  L3_RPC_URL: z.string().url(),

  // Optional bridge/aux endpoints
  L2_BRIDGE_STATUS_URL: z.string().optional(),
  L3_BRIDGE_STATUS_URL: z.string().optional(),

  // Policy / thresholds
  MAX_HEAD_LAG_SEC: z.coerce.number().default(180),        // head freshness max lag
  MAX_SAFE_LAG_SEC: z.coerce.number().default(600),        // safe/finalized lag tolerance
  MAX_BATCH_TO_L1_LAG_SEC: z.coerce.number().default(900), // L2 posting lag
  POLL_INTERVAL_MS: z.coerce.number().default(10000),

  // Routing law enforcement
  ENFORCE_ROUTING_LAW: z.coerce.boolean().default(true),
  // Hostname hint used to detect if L3 is incorrectly pointing at L1.
  // Set to the L1 RPC internal hostname (e.g. "l1-rpc-proxy").
  L1_RPC_HOSTNAME_HINT: z.string().optional()
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Configuration validation failed:");
    console.error(JSON.stringify(parsed.error.flatten(), null, 2));
    throw new Error("Invalid environment configuration — check required env vars");
  }
  return parsed.data;
}
