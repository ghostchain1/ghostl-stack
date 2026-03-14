/**
 * GhostStack Interplanetary SDK
 * Shared types, constants, and utilities for the GDTP (Ghost Delay-Tolerant Protocol) layer.
 * Supports Earth, Orbital (satellite), Lunar, and Deep-Space node environments.
 */

import { z } from "zod";

// ── Environment types ──────────────────────────────────────────────────────────

export const NODE_ENVIRONMENTS = ["earth", "orbital", "lunar", "deep-space"] as const;
export type NodeEnvironment = typeof NODE_ENVIRONMENTS[number];

export const NODE_CAPABILITIES = ["relay", "validate", "store", "zk-prove", "bundle", "sequencer"] as const;
export type NodeCapability = typeof NODE_CAPABILITIES[number];

export const BUNDLE_STATUSES = ["pending", "in-transit", "delivered", "expired", "failed"] as const;
export type BundleStatus = typeof BUNDLE_STATUSES[number];

export const ZONE_STATUSES = ["connected", "isolated", "syncing", "offline"] as const;
export type ZoneStatus = typeof ZONE_STATUSES[number];

export const CONSENSUS_MODES = ["live", "delayed", "offline", "ratification"] as const;
export type ConsensusMode = typeof CONSENSUS_MODES[number];

// ── GDTP constants ─────────────────────────────────────────────────────────────

/** One-way propagation delay estimates (ms) */
export const GDTP_LATENCY_PROFILE: Record<string, number> = {
  "earth-orbital":   500,          // LEO satellite ~300–1500 ms
  "earth-lunar":     1_300,        // Moon ~1.3 s
  "earth-mars-min":  240_000,      // Mars minimum ~4 min
  "earth-mars-max":  1_440_000,    // Mars maximum ~24 min
} as const;

/** Default bundle TTL per environment (ms) */
export const BUNDLE_TTL_MS: Record<NodeEnvironment, number> = {
  earth:        300_000,       // 5 min
  orbital:      3_600_000,     // 1 hour
  lunar:        86_400_000,    // 24 hours
  "deep-space": 604_800_000,   // 7 days
} as const;

/** Max transactions per bundle per environment */
export const MAX_BUNDLE_TX: Record<NodeEnvironment, number> = {
  earth:        500,
  orbital:      2_000,
  lunar:        10_000,
  "deep-space": 100_000,
} as const;

/** Governance vote modes in interplanetary consensus */
export const VOTE_MODES = ["online", "delayed", "offline-ratification"] as const;
export type VoteMode = typeof VOTE_MODES[number];

// ── Core data models ───────────────────────────────────────────────────────────

export interface InterplanetaryNode {
  id:            string;
  environment:   NodeEnvironment;
  host:          string;             // FQDN or IP (terrestrial) / node identifier (space)
  latencyMs:     number;             // typical one-way delay to Earth
  bandwidthBps:  number;             // uplink bytes/second capacity
  online:        boolean;
  lastContact:   number;             // Unix ms
  capabilities:  NodeCapability[];
  region?:       string;             // optional: federation region code for earth nodes
  consensusMode: ConsensusMode;
}

export interface GDTPBundle {
  id:              string;
  sourceNodeId:    string;
  destNodeId:      string;
  priority:        number;           // 0 (low) – 10 (emergency)
  ttlMs:           number;
  txCount:         number;
  merkleRoot:      string;           // hex — Merkle root over tx hashes
  zkProofHash:     string;           // hex — ZK commitment hash (stub)
  payloadHash:     string;           // hex — hash of compressed payload bytes
  compressedBytes: number;
  createdAt:       number;
  expiresAt:       number;
  status:          BundleStatus;
  hopCount:        number;
  route:           string[];         // ordered nodeId path taken
}

export interface OfflineConsensusZone {
  id:                           string;
  environment:                  NodeEnvironment;
  nodeIds:                      string[];
  status:                       ZoneStatus;
  localBlockHeight:             number;
  earthBlockHeightAtDisconnect: number;
  disconnectedAt:               number;
  reconnectedAt?:               number;
  pendingBundleCount:           number;
  pendingVotes:                 number;   // interplanetary governance votes queued
}

export interface RouteHop {
  nodeId:     string;
  latencyMs:  number;
  reliable:   boolean;
}

export interface InterplanetaryRoute {
  sourceNodeId:   string;
  destNodeId:     string;
  hops:           RouteHop[];
  totalLatencyMs: number;
  reliability:    number;    // 0.0 – 1.0
  computedAt:     number;
}

export interface InterplanetaryVote {
  proposalId:  string;
  voterNodeId: string;
  environment: NodeEnvironment;
  choice:      "for" | "against" | "abstain";
  mode:        VoteMode;
  submittedAt: number;
  deliveredAt?: number;
}

// ── Zod Schemas ────────────────────────────────────────────────────────────────

export const InterplanetaryNodeSchema = z.object({
  id:            z.string().min(1),
  environment:   z.enum(NODE_ENVIRONMENTS),
  host:          z.string().min(1),
  latencyMs:     z.number().int().min(0).default(0),
  bandwidthBps:  z.number().int().min(0).default(1_000_000),
  capabilities:  z.array(z.enum(NODE_CAPABILITIES)).default([]),
  region:        z.string().optional(),
  consensusMode: z.enum(CONSENSUS_MODES).default("live"),
});

export const SubmitBundleSchema = z.object({
  sourceNodeId: z.string().min(1),
  destNodeId:   z.string().min(1),
  priority:     z.number().int().min(0).max(10).default(5),
  txHashes:     z.array(z.string().min(10)).min(1),
  environment:  z.enum(NODE_ENVIRONMENTS).default("earth"),
});

export const BundleVerifySchema = z.object({
  bundleId:    z.string().min(1),
  merkleRoot:  z.string().length(64),
  zkProofHash: z.string().length(64),
  txHashes:    z.array(z.string().min(10)),
});

export const InterplanetaryVoteSchema = z.object({
  proposalId:  z.string().min(1),
  voterNodeId: z.string().min(1),
  environment: z.enum(NODE_ENVIRONMENTS),
  choice:      z.enum(["for", "against", "abstain"]),
  mode:        z.enum(VOTE_MODES).default("online"),
});

export type InterplanetaryNodeInput = z.infer<typeof InterplanetaryNodeSchema>;
export type SubmitBundleInput       = z.infer<typeof SubmitBundleSchema>;
export type BundleVerifyInput       = z.infer<typeof BundleVerifySchema>;
export type InterplanetaryVoteInput = z.infer<typeof InterplanetaryVoteSchema>;

// ── Utility: environment display names ────────────────────────────────────────

export const ENVIRONMENT_NAMES: Record<NodeEnvironment, string> = {
  earth:        "Earth Network",
  orbital:      "Orbital Relay (Satellite)",
  lunar:        "Lunar Node Network",
  "deep-space": "Deep-Space Mission",
} as const;

/** Infer expected one-way latency between two environments (ms) */
export function estimateLatencyMs(from: NodeEnvironment, to: NodeEnvironment): number {
  if (from === to) return 50;
  const key = `${from}-${to}`;
  const reverse = `${to}-${from}`;
  return GDTP_LATENCY_PROFILE[key] ?? GDTP_LATENCY_PROFILE[reverse] ?? 5_000;
}

/** Estimate bundle TTL given source environment */
export function bundleTtlForEnvironment(env: NodeEnvironment): number {
  return BUNDLE_TTL_MS[env];
}
