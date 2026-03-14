/**
 * @file src/types.ts
 * Ghost Global Network Intelligence — shared type definitions.
 */

// ── Node / Peer types ─────────────────────────────────────────────────────────

export type ChainLayer = 'l1' | 'l2' | 'l3';

export interface NodeInfo {
  /** JSON-RPC endpoint URL */
  endpoint:   string;
  chain:      ChainLayer;
  peers:      number;
  blockNumber: bigint;
  /** Unix ms of last successful poll */
  lastSeen:   number;
  latencyMs:  number;
  healthy:    boolean;
}

// ── Geo / Region types ────────────────────────────────────────────────────────

export type RegionCode = 'NA' | 'EU' | 'AS' | 'SA' | 'OC' | 'AF' | 'UNKNOWN';

export interface RegionNode {
  ip:         string;
  country:    string;
  region:     RegionCode;
  lat:        number;
  lon:        number;
  nodeCount:  number;
}

export interface RegionGap {
  region:     RegionCode;
  nodeCount:  number;
  minTarget:  number;
  deficit:    number;
}

// ── Scaling / Topology snapshot ───────────────────────────────────────────────

export interface TopologySnapshot {
  ts:           number;
  nodes:        NodeInfo[];
  totalPeers:   number;
  avgPeers:     number;
  minPeers:     number;
  gaps:         RegionGap[];
  unhealthyCount: number;
}

// ── Expansion proposal ────────────────────────────────────────────────────────

export type DeploymentTarget = 'vm' | 'cloud' | 'container';

export interface ExpansionProposal {
  proposalId:   string;
  reason:       string;
  target:       DeploymentTarget;
  chain:        ChainLayer;
  region:       RegionCode;
  nodeType:     'rpc' | 'validator' | 'archive';
  /** Cloud or datacenter hint — informational only */
  provider?:    string;
  priority:     'low' | 'medium' | 'high' | 'critical';
  requestedBy:  string;
  ts:           number;
  /** Proposal is advisory — requires human ratification via signing relay */
  advisory:     true;
}

// ── Load prediction ───────────────────────────────────────────────────────────

export interface LoadSample {
  ts:          number;
  tps:         number;
  peerCount:   number;
  blockTimeMs: number;
}

export interface LoadForecast {
  estimatedTps:         number;
  estimatedPeers:       number;
  expansionRecommended: boolean;
  confidence:           number;  // 0-1
  reason:               string;
}

// ── GNI status ────────────────────────────────────────────────────────────────

export interface GniStatus {
  service:       string;
  version:       string;
  uptime:        number;
  lastTopology:  TopologySnapshot | null;
  lastForecast:  LoadForecast | null;
  proposals: {
    total:  number;
    failed: number;
  };
}
