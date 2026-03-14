// GhostBrain Regional Control Layer — shared types

export type RegionId = 'north-america' | 'europe' | 'asia';
export type AttackType = 'ddos' | 'validator-manipulation' | 'bridge-exploit' | 'network-partition';
export type Severity   = 'low' | 'medium' | 'high' | 'critical';
export type CloudProvider = 'bare-metal' | 'aws' | 'hetzner' | 'google-cloud' | 'edge';

// ── Per-region health ─────────────────────────────────────────────────────────

export interface RegionMetrics {
  regionId:         RegionId;
  validatorLoad:    number;          // 0–1
  rpcRequestsPerSec: number;
  latencyMs:        number;
  activeValidators: number;
  totalValidators:  number;
  onlinePct:        number;          // 0–100
  lastUpdatedAt:    number;
}

// ── Traffic routing ───────────────────────────────────────────────────────────

export interface TrafficLoad {
  regionId: RegionId;
  load:     number;                  // 0–100
  overflow: boolean;
  routeTo?: RegionId;
}

// ── Validator distribution ────────────────────────────────────────────────────

export interface ValidatorBalance {
  regionId: RegionId;
  assigned: number;
  target:   number;
  delta:    number;                  // positive = needs more, negative = surplus
}

// ── Security ──────────────────────────────────────────────────────────────────

export interface SecurityEvent {
  id:                 string;
  regionId:           RegionId;
  attackType:         AttackType;
  severity:           Severity;
  detectedAt:         number;
  description:        string;
  mitigationProposed: boolean;
}

// ── Scaling ───────────────────────────────────────────────────────────────────

export interface ScalingAction {
  regionId:       RegionId;
  layer:          'L1' | 'L2' | 'L3';
  nodesRequested: number;
  reason:         string;
  urgency:        'low' | 'medium' | 'high';
}

// ── Proposals (detect-and-propose only) ──────────────────────────────────────

export interface RegionalProposal {
  id:          string;
  type:        'traffic-reroute' | 'validator-rebalance' | 'security-response' | 'scale-out' | 'scale-in';
  description: string;
  payload:     Record<string, unknown>;
  urgency:     'critical' | 'high' | 'medium' | 'low';
  createdAt:   number;
  requiresHumanRatification: true;
}

// ── Global status snapshot ────────────────────────────────────────────────────

export interface GlobalStatus {
  cycleAt:           number;
  totalNodes:        number;
  activeRegions:     number;
  validatorClusters: number;
  avgLatencyMs:      number;
  regions:           RegionMetrics[];
  trafficLoads:      TrafficLoad[];
  validatorBalance:  ValidatorBalance[];
  securityEvents:    SecurityEvent[];
  scalingActions:    ScalingAction[];
  activeProposals:   number;
  dryRun:            boolean;
}
