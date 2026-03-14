/**
 * GhostBrain Swarm Coordinator — Agent Registry & Task Dispatch
 *
 * Coordinates the multi-agent GhostBrain AI swarm. Each specialized agent
 * is an independent microservice; this coordinator handles:
 *   - Agent health probing (heartbeats)
 *   - Task routing to the best available agent
 *   - Result aggregation and quorum voting (2-of-N for high-stakes actions)
 *   - Swarm-level metrics and alerting
 *
 * Port : 7960  (SWARM_PORT env to override)
 * Bind : 127.0.0.1 (SWARM_BIND env — set 0.0.0.0 in Docker)
 *
 * Agent network (default endpoints — all overridable via env):
 *   GhostBrain Core        → AGENT_CORE_URL       (default: http://127.0.0.1:7900)
 *   Ghost Protocol Architect → AGENT_PROTOCOL_URL  (default: http://127.0.0.1:7910)
 *   Ghost DeFi Architect   → AGENT_DEFI_URL        (default: http://127.0.0.1:7920)
 *   Ghost Governor AI      → AGENT_GOVERNOR_URL    (default: http://127.0.0.1:7930)
 *   Ghost Contract Engine  → AGENT_CONTRACT_URL    (default: http://127.0.0.1:7940)
 *   Ghost Infra Controller → AGENT_INFRA_URL       (default: http://127.0.0.1:7950)
 *
 * Swarm v2 agents (proxied via ghost-ai-swarm-v2 on port 7970):
 *   architect | executor | auditor | network | node
 *   treasury  | market   | dex     | lend
 *   security  | fraud    | dao
 */

/** Base URL for ghost-ai-swarm-v2 — hosts 15 specialized agents */
const SWARM_V2 = process.env.SWARM_V2_URL ?? "http://127.0.0.1:7970";

export const AGENT_URLS: Record<string, string> = {
  // Legacy direct-service agents (original 6)
  core:      process.env.AGENT_CORE_URL      ?? "http://127.0.0.1:7900",
  protocol:  process.env.AGENT_PROTOCOL_URL  ?? "http://127.0.0.1:7910",
  defi:      process.env.AGENT_DEFI_URL      ?? "http://127.0.0.1:7920",
  governor:  process.env.AGENT_GOVERNOR_URL  ?? "http://127.0.0.1:7930",
  contract:  process.env.AGENT_CONTRACT_URL  ?? "http://127.0.0.1:7940",
  infra:     process.env.AGENT_INFRA_URL     ?? "http://127.0.0.1:7950",

  // Swarm v2 agents — all proxied through ghost-ai-swarm-v2
  architect: process.env.AGENT_ARCHITECT_URL ?? SWARM_V2,
  executor:  process.env.AGENT_EXECUTOR_URL  ?? SWARM_V2,
  auditor:   process.env.AGENT_AUDITOR_URL   ?? SWARM_V2,
  network:   process.env.AGENT_NETWORK_URL   ?? SWARM_V2,
  node:      process.env.AGENT_NODE_URL      ?? SWARM_V2,
  treasury:  process.env.AGENT_TREASURY_URL  ?? SWARM_V2,
  market:    process.env.AGENT_MARKET_URL    ?? SWARM_V2,
  dex:       process.env.AGENT_DEX_URL       ?? SWARM_V2,
  lend:      process.env.AGENT_LEND_URL      ?? SWARM_V2,
  security:  process.env.AGENT_SECURITY_URL  ?? SWARM_V2,
  fraud:     process.env.AGENT_FRAUD_URL     ?? SWARM_V2,
  dao:       process.env.AGENT_DAO_URL       ?? SWARM_V2,
};

export const SWARM_PORT = Number(process.env.SWARM_PORT ?? "7960");
export const SWARM_BIND = process.env.SWARM_BIND ?? "127.0.0.1";

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? "30000");

/** Max ms to wait for an agent health probe before marking it offline */
export const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? "5000");

/** Task execution timeout */
export const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_MS ?? "30000");
