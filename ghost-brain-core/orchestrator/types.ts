/**
 * GhostBrain Global Orchestrator — Shared Types
 *
 * Covers all entities managed by the orchestrator:
 *   GhostNodes, Regions, Routing decisions, Scaling recommendations,
 *   Failover events, Latency probes, Cross-region consensus state.
 *
 * Chain identity constants:
 *   GhostChain L1  chain_id = 14000101
 *   GhostL2        chain_id = 901
 *   GhostL3        chain_id = 903
 *
 * No `any` types. No external chain references.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type NodeRole =
  | "l1"           // GhostChain full node
  | "l2"           // GhostL2 op-geth / op-node
  | "l3"           // GhostL3 op-geth / op-node
  | "sequencer"    // L2 or L3 sequencer
  | "batcher"      // L2 op-batcher
  | "validator"    // L1 validator / CometBFT signer
  | "ai_compute"   // GhostBrain AI compute node
  | "rpc_proxy";   // Public-facing RPC gateway

export type NodeStatus = "healthy" | "degraded" | "offline" | "unknown";

/** Canonical GhostChain chain IDs. */
export type ChainId = 14000101 | 901 | 903;

export type ScalingAction = "scale_up" | "scale_down" | "rebalance" | "none";

export type FailoverStrategy =
  | "promote_replica"
  | "reroute_traffic"
  | "governance_propose";

export type ConsensusState =
  | "synchronized"
  | "lagging"
  | "diverged"
  | "unknown";

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface GhostNode {
  /** UUID — validated before use in any path or payload. */
  id:            string;
  role:          NodeRole;
  region:        string;
  /** Hostname or IPv4 — never a user-interpolated string. */
  host:          string;
  rpcPort:       number;
  adminPort?:    number;
  /** Populated for l1/l2/l3/sequencer/batcher/validator nodes. */
  chainId?:      ChainId;
  status:        NodeStatus;
  /** CPU/memory composite load 0–100. */
  loadPct:       number;
  /** Measured round-trip latency in ms. */
  latencyMs:     number;
  blockHeight?:  number;
  /** Unix milliseconds of last successful health probe. */
  lastSeenAt:    number;
  /** Optional string-valued labels (no arbitrary nested objects). */
  labels?:       Record<string, string>;
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export interface RegionInfo {
  /** Short slug, e.g. "us-east-1". */
  id:               string;
  name:             string;
  /** Hostnames of primary chain nodes in this region. */
  primaryL1Host:    string;
  primaryL2Host:    string;
  primaryL3Host:    string;
  /** P50 latency from orchestrator to this region in ms. */
  avgLatencyMs:     number;
  nodeCount:        number;
  healthyCount:     number;
  lastCheckedAt:    number;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface WorkloadRequest {
  role:                NodeRole;
  chainId?:            ChainId;
  /** Candidate must respond within this many ms. */
  maxLatencyMs?:       number;
  /** Candidate must have at least this much free capacity (100 - loadPct). */
  minHeadroomPct?:     number;
}

export interface RoutingDecision {
  requestId:       string;
  selectedNodeId:  string;
  selectedRegion:  string;
  latencyMs:       number;
  /** Human-readable selection rationale. */
  reason:          string;
  decidedAt:       number;
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

export interface ScalingRecommendation {
  region:          string;
  action:          ScalingAction;
  /** Why this action was triggered. */
  trigger:         string;
  avgLoadPct:      number;
  nodeCount:       number;
  recommendedAt:   number;
}

// ---------------------------------------------------------------------------
// Failover
// ---------------------------------------------------------------------------

export interface FailoverEvent {
  region:           string;
  offlineNodeId:    string;
  strategy:         FailoverStrategy;
  /** Set when a replica is promoted. */
  promotedNodeId?:  string;
  triggeredAt:      number;
}

// ---------------------------------------------------------------------------
// Latency probing
// ---------------------------------------------------------------------------

export interface LatencyProbeResult {
  nodeId:      string;
  host:        string;
  port:        number;
  latencyMs:   number;
  reachable:   boolean;
  probedAt:    number;
}

// ---------------------------------------------------------------------------
// Cross-region consensus
// ---------------------------------------------------------------------------

export interface CrossRegionState {
  regionId:       string;
  l1BlockHeight:  number;
  l2BlockHeight:  number;
  l3BlockHeight:  number;
  /** l2BlockHeight gap vs. global L1 head. */
  l2LagBlocks:    number;
  /** l3BlockHeight gap vs. global L2 head. */
  l3LagBlocks:    number;
  state:          ConsensusState;
  checkedAt:      number;
}

// ---------------------------------------------------------------------------
// Cluster allocation
// ---------------------------------------------------------------------------

export interface AllocationRequest {
  region:         string;
  requiredRoles:  NodeRole[];
  minCount:       number;
}

export interface AllocationResult {
  region:          string;
  allocatedNodes:  GhostNode[];
  missingRoles:    NodeRole[];
  satisfiedAt:     number;
}
