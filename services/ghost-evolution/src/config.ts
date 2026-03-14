/**
 * ghost-evolution — Autonomous Ecosystem Scanner & Upgrade Engine
 *
 * Scans the deployed GhostStack ecosystem, identifies gaps in the feature set,
 * and generates human-ratifiable governance upgrade proposals.
 *
 * AI governance model: ghost-evolution *writes* proposals; humans *ratify* them.
 * No autonomous on-chain execution occurs without governance quorum.
 *
 * Port : 7962  (EVOLUTION_PORT env to override)
 * Bind : 127.0.0.1 (EVOLUTION_BIND env — set 0.0.0.0 in Docker)
 */

export const EVOLUTION_PORT = Number(process.env.EVOLUTION_PORT ?? "7962");
export const EVOLUTION_BIND = process.env.EVOLUTION_BIND ?? "127.0.0.1";

export const GHOSTBRAIN_URL   = process.env.GHOSTBRAIN_URL   ?? "http://127.0.0.1:7900";
export const GHOST_L1_RPC     = process.env.GHOST_L1_RPC     ?? "http://127.0.0.1:18545";
export const GHOST_L2_RPC     = process.env.GHOST_L2_RPC     ?? "http://127.0.0.1:29545";
export const GHOST_L3_RPC     = process.env.GHOST_L3_RPC     ?? "http://127.0.0.1:39545";
export const DEPLOYER_URL     = process.env.DEPLOYER_URL      ?? "http://127.0.0.1:7961";
export const SWARM_URL        = process.env.SWARM_URL         ?? "http://127.0.0.1:7960";
export const GOVERNANCE_URL   = process.env.GOVERNANCE_URL    ?? "http://127.0.0.1:7685";

/** How often to run a background ecosystem scan (ms) */
export const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS ?? "300000"); // 5 min
