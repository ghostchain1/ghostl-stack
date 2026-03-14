// GhostBrain Swarm Agent — configuration
import { hostname } from 'os';

export const AGENT_ID: string = process.env.AGENT_ID ?? hostname();

export const CONFIG = {
  nodeType: (process.env.NODE_TYPE ?? 'validator') as 'validator' | 'l1' | 'l2' | 'l3' | 'docker' | 'hypervisor',
  natsUrl: process.env.NATS_URL ?? 'nats://localhost:4222',
  ghostbrainUrl: process.env.GHOSTBRAIN_URL ?? 'http://localhost:7900',
  apiBase: process.env.API_BASE_URL ?? 'http://localhost:4000',
  healthPort: Number(process.env.GHOSTAGENT_PORT ?? 7922),
  // How often each task runs (ms)
  validatorIntervalMs: Number(process.env.VALIDATOR_INTERVAL_MS ?? 30_000),
  networkIntervalMs: Number(process.env.NETWORK_INTERVAL_MS ?? 45_000),
  securityIntervalMs: Number(process.env.SECURITY_INTERVAL_MS ?? 60_000),
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000),
  // Thresholds
  cpuCriticalPct: Number(process.env.CPU_CRITICAL_PCT ?? 90),
  cpuWarningPct: Number(process.env.CPU_WARNING_PCT ?? 75),
  minUptimeSec: Number(process.env.MIN_UPTIME_SEC ?? 60),
  minPeerCount: Number(process.env.MIN_PEER_COUNT ?? 3),
} as const;
