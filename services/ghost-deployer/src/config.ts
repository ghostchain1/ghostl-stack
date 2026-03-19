/**
 * ghost-deployer — configuration
 *
 * Port  : 7961  (DEPLOYER_PORT env to override)
 * Bind  : 127.0.0.1 (DEPLOYER_BIND env — set 0.0.0.0 in Docker)
 *
 * Chain endpoints (overridable via env):
 *   GHOST_L1_RPC   L1 GhostChain   chainId 14000101  port 18545
 *   GHOST_L2_RPC   GhostL2         chainId 901        port 29547
 *   GHOST_L3_RPC   GhostL3         chainId 903        port 39545
 *
 * Paths:
 *   CONTRACTS_ROOT  absolute path to the contracts/ directory
 *   ARTIFACTS_DIR   absolute path to Forge out-codex/ artifacts
 */
import { resolve } from "path";

export const DEPLOYER_PORT  = Number(process.env.DEPLOYER_PORT ?? "7961");
export const DEPLOYER_BIND  = process.env.DEPLOYER_BIND ?? "127.0.0.1";

export const GHOST_L1_RPC = process.env.GHOST_L1_RPC ?? "http://127.0.0.1:18545";
export const GHOST_L2_RPC = process.env.GHOST_L2_RPC ?? "http://127.0.0.1:7260";
export const GHOST_L3_RPC = process.env.GHOST_L3_RPC ?? "http://127.0.0.1:7270";

export const L1_CHAIN_ID = 14000101;
export const L2_CHAIN_ID = 901;
export const L3_CHAIN_ID = 903;

// Resolve contracts root relative to this service (two levels up from services/ghost-deployer/)
const WORKSPACE = resolve(new URL(import.meta.url).pathname, "../../..", "..", "..");
export const CONTRACTS_ROOT = process.env.CONTRACTS_ROOT  ?? resolve(WORKSPACE, "contracts");
export const ARTIFACTS_DIR  = process.env.ARTIFACTS_DIR   ?? resolve(WORKSPACE, "contracts", "out-codex");

/** GhostBrain audit endpoint — optional; if unreachable, audit step is skipped */
export const GHOSTBRAIN_URL = process.env.GHOSTBRAIN_URL ?? "http://127.0.0.1:7900";

/** Bridge hub endpoint for L3→L2 asset bridging */
export const BRIDGE_HUB_URL = process.env.BRIDGE_HUB_URL ?? "http://127.0.0.1:8500";
