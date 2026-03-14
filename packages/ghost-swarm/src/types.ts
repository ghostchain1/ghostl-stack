// types.ts — shared type definitions for ghost-swarm

export interface SwarmEvent {
  /** Unique id for this event. */
  id?: string;
  /** Event classification (e.g. "service-failure", "load-spike", "anomaly"). */
  type: string;
  /** Originating node id. */
  sourceNodeId?: string;
  /** Arbitrary event payload. */
  [key: string]: unknown;
}

export type SwarmEventHandler = (event: SwarmEvent) => void;

export interface SwarmNodeInfo {
  id: string;
  region?: string;
  role?: string;
  agentCount: number;
  registeredAt: number;
}

export interface Proposal {
  id: string;
  description: string;
  vote: 'yes' | 'no' | 'abstain';
  score: number;
  proposedBy: string;
  payload?: Record<string, unknown>;
}

export interface ConsensusResult {
  passed: boolean;
  yesVotes: number;
  totalVotes: number;
  winningProposal?: Proposal;
}

export interface PredictionMetrics {
  cpu: number;
  disk: number;
  memory: number;
  load: number;
  errorRate: number;
  latencyMs: number;
}

export interface FailureHistory {
  errors: number;
  restarts: number;
  latencySpikes: number;
  windowMs: number;
}

export interface Region {
  id: string;
  name: string;
  latencyMs: number;
  load: number;
  healthy: boolean;
  endpoint: string;
}

export interface RoutingRequest {
  clientRegion?: string;
  workloadType?: string;
}
