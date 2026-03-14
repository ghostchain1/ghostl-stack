/**
 * GhostStack Global Federation SDK
 * Shared types, constants, and utilities for the federation layer.
 */

import { z } from "zod";

// ── Region definitions ─────────────────────────────────────────────────────────

export const FEDERATION_REGIONS = [
  "NA",  // North America
  "EU",  // Europe
  "AS",  // Asia
  "SA",  // South America
  "AF",  // Africa
  "OC",  // Oceania
] as const;

export type FederationRegion = typeof FEDERATION_REGIONS[number];

export const REGION_NAMES: Record<FederationRegion, string> = {
  NA: "North America",
  EU: "Europe",
  AS: "Asia",
  SA: "South America",
  AF: "Africa",
  OC: "Oceania",
};

// ── Node roles within a cluster ────────────────────────────────────────────────

export const NODE_ROLES = [
  "validator",   // consensus participation
  "archive",     // full history storage
  "rpc",         // public RPC endpoint
  "bridge",      // cross-region / cross-chain bridge relay
  "monitor",     // prometheus + health probing
  "sequencer",   // L2/L3 transaction sequencing
] as const;

export type NodeRole = typeof NODE_ROLES[number];

// ── Cluster status ─────────────────────────────────────────────────────────────

export const CLUSTER_STATUSES = ["healthy", "degraded", "offline", "failover"] as const;
export type ClusterStatus = typeof CLUSTER_STATUSES[number];

// ── Validator status ───────────────────────────────────────────────────────────

export const VALIDATOR_STATUSES = ["active", "jailed", "quarantined", "exiting", "offline"] as const;
export type ValidatorStatus = typeof VALIDATOR_STATUSES[number];

// ── Core data models ───────────────────────────────────────────────────────────

export interface ClusterNode {
  id:       string;          // unique within cluster: "${region}-${role}-${index}"
  region:   FederationRegion;
  role:     NodeRole;
  host:     string;          // FQDN or IP
  l1Port:   number;          // EVM RPC port
  l2Port:   number;
  l3Port:   number;
  cosmosPort: number;        // Cosmos LCD port (1317-style)
  online:   boolean;
  blockL1:  number;
  blockL2:  number;
  blockL3:  number;
  lastSeen: number;          // Unix ms
}

export interface RegionCluster {
  region:    FederationRegion;
  name:      string;
  status:    ClusterStatus;
  nodes:     ClusterNode[];
  validatorCount: number;
  tps:       number;         // measured TPS
  avgLatencyMs: number;
  updatedAt:  number;
}

export interface ValidatorRecord {
  address:    string;        // EVM address (0x...)
  region:     FederationRegion;
  status:     ValidatorStatus;
  reputationScore: number;   // 0–1000
  uptime:     number;        // 0.0–1.0
  avgLatencyMs: number;
  participationRate: number; // 0.0–1.0
  slashCount: number;
  totalBlocks: number;
  missedBlocks: number;
  joinedAt:   number;
  lastActiveAt: number;
}

// ── GIP (Ghost Interchain Protocol) messages ───────────────────────────────────

export const GIP_MESSAGE_TYPES = [
  "block-sync",          // latest block announcement
  "validator-heartbeat", // validator liveness ping
  "cluster-health",      // region health broadcast
  "failover-request",    // request traffic reroute
  "failover-ack",        // confirm takeover
  "governance-relay",    // governance proposal propagation
  "slash-signal",        // validator slash notification
] as const;

export type GipMessageType = typeof GIP_MESSAGE_TYPES[number];

export interface GipMessage<T = unknown> {
  id:        string;
  type:      GipMessageType;
  sourceRegion: FederationRegion;
  targetRegion?: FederationRegion;  // undefined = broadcast
  payload:   T;
  timestamp: number;
  ttlMs:     number;    // discard after this many ms
}

// ── Reputation scoring constants ───────────────────────────────────────────────

/** Thresholds for automatic validator actions */
export const REPUTATION_THRESHOLDS = {
  /** Score below this → quarantine recommendation */
  QUARANTINE:  300,
  /** Score below this → slash recommendation */
  SLASH:       150,
  /** Score below this after quarantine → exit recommendation */
  FORCE_EXIT:   50,
  /** Score above this after recovery → reinstate */
  REINSTATE:   600,
} as const;

/** Weights for reputation scoring (must sum ≤ 1000) */
export const REPUTATION_WEIGHTS = {
  uptime:           400,
  participation:    300,
  latency:          200,
  security:         100,
} as const;

// ── Zod schemas ────────────────────────────────────────────────────────────────

export const ClusterNodeSchema = z.object({
  id:      z.string(),
  region:  z.enum(FEDERATION_REGIONS),
  role:    z.enum(NODE_ROLES),
  host:    z.string(),
  l1Port:  z.number().int().default(18545),
  l2Port:  z.number().int().default(29545),
  l3Port:  z.number().int().default(39545),
  cosmosPort: z.number().int().default(1317),
});

export const RegisterClusterSchema = z.object({
  region: z.enum(FEDERATION_REGIONS),
  nodes:  z.array(ClusterNodeSchema).min(1),
});

export const GipMessageSchema = z.object({
  type:         z.enum(GIP_MESSAGE_TYPES),
  sourceRegion: z.enum(FEDERATION_REGIONS),
  targetRegion: z.enum(FEDERATION_REGIONS).optional(),
  payload:      z.record(z.unknown()),
  ttlMs:        z.number().int().min(1000).max(300_000).default(30_000),
});

export const ReputationUpdateSchema = z.object({
  address:          z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  region:           z.enum(FEDERATION_REGIONS),
  uptimeSamples:    z.array(z.boolean()),                   // last N liveness probes
  latencySamplesMs: z.array(z.number().int().min(0)),
  blocksProposed:   z.number().int().min(0),
  blocksMissed:     z.number().int().min(0),
  slashEventCount:  z.number().int().min(0).default(0),
});

export type RegisterClusterInput  = z.infer<typeof RegisterClusterSchema>;
export type GipMessageInput       = z.infer<typeof GipMessageSchema>;
export type ReputationUpdateInput = z.infer<typeof ReputationUpdateSchema>;

// ── Utility: compute reputation score ─────────────────────────────────────────

export function computeReputationScore(input: ReputationUpdateInput): number {
  const uptime = input.uptimeSamples.length > 0
    ? input.uptimeSamples.filter(Boolean).length / input.uptimeSamples.length
    : 0;

  const participation = (input.blocksProposed + input.blocksMissed) > 0
    ? input.blocksProposed / (input.blocksProposed + input.blocksMissed)
    : 0;

  const avgLatency = input.latencySamplesMs.length > 0
    ? input.latencySamplesMs.reduce((a, b) => a + b, 0) / input.latencySamplesMs.length
    : 9999;
  // Latency score: 0ms=200, 500ms=100, 2000ms=0
  const latencyScore = Math.max(0, 200 - Math.round(avgLatency / 10));

  const slashPenalty = Math.min(100, input.slashEventCount * 50);

  const raw =
    uptime        * REPUTATION_WEIGHTS.uptime +
    participation * REPUTATION_WEIGHTS.participation +
    latencyScore / 200 * REPUTATION_WEIGHTS.latency +
    (1 - slashPenalty / 100) * REPUTATION_WEIGHTS.security;

  return Math.max(0, Math.min(1000, Math.round(raw)));
}
