// GhostBrain Planet-Scale Architecture — shared types
// All operations are DETECT-AND-PROPOSE only; no autonomous on-chain execution.

export type ChainId = 14000101 | 901 | 903;

// ──────────────────────────────────────────────
// Region layer
// ──────────────────────────────────────────────

export type RegionId =
  | 'us-east'
  | 'us-west'
  | 'eu-west'
  | 'eu-central'
  | 'ap-east'
  | 'ap-south'
  | 'sa-east'
  | 'af-south';

export type RegionStatus = 'healthy' | 'degraded' | 'critical' | 'offline';

export interface RegionDef {
  id: RegionId;
  name: string;
  validatorCount: number;
  priority: number; // 1 = primary
  lat: number;
  lon: number;
}

export interface RegionHealth {
  regionId: RegionId;
  status: RegionStatus;
  activeValidators: number;
  totalValidators: number;
  latencyMs: number;
  blockHeight: number;
  lastCheckAt: number;
}

export interface FailoverAction {
  fromRegion: RegionId;
  toRegion: RegionId;
  validatorsMoved: number;
  reason: string;
}

// ──────────────────────────────────────────────
// Consensus layer
// ──────────────────────────────────────────────

export type NodeType = 'validator' | 'full' | 'satellite' | 'observer';
export type NodeConnectivity = 'online' | 'offline' | 'intermittent';

export interface ConsensusNode {
  nodeId: string;
  regionId: RegionId;
  type: NodeType;
  connectivity: NodeConnectivity;
  lastSeenHeight: number;
  behindByBlocks: number;
  chainId: ChainId;
}

export interface SyncStatus {
  nodeId: string;
  regionId: RegionId;
  chainId: ChainId;
  reconnected: boolean;
  blocksToSync: number;
  estimatedSyncMs: number;
}

export interface ConsensusSnapshot {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  satelliteNodes: number;
  globalParticipationPct: number;
  pendingSyncs: SyncStatus[];
}

// ──────────────────────────────────────────────
// Liquidity mesh layer
// ──────────────────────────────────────────────

export interface MeshNode {
  regionId: RegionId;
  chainId: ChainId;
  gstBalance: bigint;
  targetBalance: bigint;
  utilisation: number; // 0–1
}

export interface MeshImbalance {
  surplus: RegionId;
  deficit: RegionId;
  chainId: ChainId;
  deltaGst: bigint;
  imbalancePct: number;
}

export interface MeshRebalanceAction {
  from: RegionId;
  to: RegionId;
  chainId: ChainId;
  amountGst: bigint;
  priority: 'high' | 'medium' | 'low';
}

export interface LiquidityMeshSnapshot {
  nodes: MeshNode[];
  imbalances: MeshImbalance[];
  totalGstLocked: bigint;
  globalUtilisation: number;
}

// ──────────────────────────────────────────────
// Inter-chain coordination layer
// ──────────────────────────────────────────────

export interface InterchainMessage {
  id: string;
  sourceChain: ChainId;
  targetChain: ChainId;
  topic: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface AISyncEvent {
  eventId: string;
  originRegion: RegionId;
  eventType: 'region-health' | 'mesh-imbalance' | 'consensus-gap' | 'failover';
  data: Record<string, unknown>;
  propagatedTo: RegionId[];
  ts: number;
}

// ──────────────────────────────────────────────
// Service snapshot & proposal
// ──────────────────────────────────────────────

export interface PlanetSnapshot {
  cycleAt: number;
  regions: RegionHealth[];
  consensus: ConsensusSnapshot;
  liquidityMesh: LiquidityMeshSnapshot;
  failoverActions: FailoverAction[];
  pendingRebalances: MeshRebalanceAction[];
  syncBacklog: SyncStatus[];
  activeProposals: number;
}

export interface PlanetProposal {
  id: string;
  type:
    | 'region-failover'
    | 'consensus-sync'
    | 'mesh-rebalance'
    | 'validator-expansion'
    | 'chain-parameter-update';
  description: string;
  payload: Record<string, unknown>;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  createdAt: number;
  requiresHumanRatification: true;
}
