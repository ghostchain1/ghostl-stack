// GVM — Config
// Reads from environment variables with sane defaults.

import { z } from "zod";

const Env = z.object({
  // ─── Network ────────────────────────────────────────────────────────────────
  PORT:             z.coerce.number().default(7646),
  HOST:             z.string().default("0.0.0.0"),
  LOG_LEVEL:        z.enum(["trace","debug","info","warn","error","fatal"]).default("info"),

  // ─── GVM chain ──────────────────────────────────────────────────────────────
  GVM_CHAIN_ID:     z.coerce.number().default(9001),
  GVM_BLOCK_TIME_MS: z.coerce.number().default(2000),
  GVM_GAS_LIMIT:    z.coerce.bigint().default(30_000_000n),
  GVM_BASE_FEE:     z.coerce.bigint().default(1_000_000_000n),  // 1 gwei

  // ─── Parent L2 RPC ──────────────────────────────────────────────────────────
  L2_RPC_URL:       z.string().default("http://op-node:9546"),

  // ─── GhostVirtualMachine anchor contract on L2 ──────────────────────────────
  GVM_CONTRACT_ADDRESS: z.string().default(""),

  // ─── State persistence ───────────────────────────────────────────────────────
  GVM_DATA_DIR:     z.string().default("/data/gvm"),

  // ─── Routing law ─────────────────────────────────────────────────────────────
  ENFORCE_ROUTING_LAW: z.coerce.boolean().default(true),
});

export type Config = z.infer<typeof Env>;

let _cfg: Config | undefined;
export function config(): Config {
  if (!_cfg) _cfg = Env.parse(process.env);
  return _cfg;
}
