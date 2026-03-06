// types.ts — shared type definitions for ghost-consciousness

// ─── Ecosystem state ──────────────────────────────────────────────────────────

export type NetworkHealth = 'healthy' | 'degrading' | 'critical' | 'recovering';
export type EconomicStatus = 'stable' | 'volatile' | 'contracting' | 'expanding';
export type ExpansionSignal = 'hold' | 'grow' | 'consolidate' | 'accelerate';
export type CoordinationDirective =
  | 'activate_swarm_repair'
  | 'trigger_treasury_strategy'
  | 'initiate_expansion'
  | 'stabilize_economy'
  | 'engage_diplomacy'
  | 'escalate_governance'
  | 'idle';

export interface EcosystemState {
  networkHealth: NetworkHealth;
  economy: EconomicStatus;
  nodes: number;
  activeTreaties: number;
  swarmCount: number;
  freeCapacity: number;         // 0-100 %
  threatLevel: 'none' | 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface ConsciousnessSnapshot {
  state: EcosystemState;
  directive: CoordinationDirective;
  awareness: AwarenessReport;
  timestamp: number;
}

// ─── Awareness ────────────────────────────────────────────────────────────────

export interface AwarenessReport {
  networkHealth: NetworkHealth;
  economy: EconomicStatus;
  infrastructure: InfrastructureAwareness;
  expansionSignal: ExpansionSignal;
  riskScore: number;            // 0-100
}

export interface InfrastructureAwareness {
  nodes: number;
  freeCapacity: number;
  regions: string[];
  bottlenecks: string[];
}

// ─── Swarm coordination ───────────────────────────────────────────────────────

export type SwarmVote = 'yes' | 'no' | 'abstain';

export interface SwarmAgent {
  id: string;
  name: string;
  region: string;
  specialization: string;
  vote(issue: SwarmIssue): SwarmVote;
}

export interface SwarmIssue {
  id: string;
  type: 'repair' | 'expansion' | 'governance' | 'diplomacy' | 'security';
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  payload?: Record<string, unknown>;
}

export interface SwarmDeliberation {
  issue: SwarmIssue;
  votes: SwarmVote[];
  outcome: boolean;
  consensus: number;            // 0-1 ratio of yes votes
  timestamp: number;
}

export interface MediationResult {
  resolved: boolean;
  outcome: boolean;
  votes: SwarmVote[];
  consensus: number;
  reasoning: string;
}

// ─── Diplomacy ────────────────────────────────────────────────────────────────

export type TreatyType =
  | 'liquidity_alliance'
  | 'bridge_agreement'
  | 'validator_alliance'
  | 'shared_infrastructure'
  | 'fee_sharing'
  | 'security_pact';

export interface CrossChainTarget {
  chainId: string;
  chainName: string;
  bridgeAddress?: string;
  tvl?: number;
  validators?: number;
}

export interface Treaty {
  id: string;
  type: TreatyType;
  parties: string[];           // chain IDs
  terms: TreatyTerms;
  status: 'proposed' | 'active' | 'expired' | 'violated' | 'terminated';
  signedAt: number;
  expiresAt?: number;
}

export interface TreatyTerms {
  liquidityCommitment?: number;
  feeSharePercent?: number;
  validatorQuota?: number;
  bridgeCapacity?: number;
  duration?: number;           // ms
  penalties?: string[];
  customTerms?: Record<string, unknown>;
}

export interface NegotiationProposal {
  chain: CrossChainTarget;
  treatyType: TreatyType;
  terms: TreatyTerms;
}

// ─── Expansion ────────────────────────────────────────────────────────────────

export type ExpansionAction =
  | 'deploy_l3_ecosystem'
  | 'launch_defi_protocol'
  | 'launch_gaming_l3'
  | 'launch_identity_system'
  | 'scale_validators'
  | 'open_new_region';

export interface EcosystemMetrics {
  demand: number;              // 0-100
  utilization: number;        // 0-100 %
  revenueGrowthRate: number;   // %
  userGrowthRate: number;      // %
  availableCapital: number;
}

export interface ExpansionPlan {
  action: ExpansionAction;
  rationale: string;
  estimatedCost: number;
  estimatedBenefit: number;
  timeToMarket: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ProtocolProposal {
  id: string;
  name: string;
  category: 'defi' | 'gaming' | 'identity' | 'infrastructure' | 'governance' | 'social';
  status: 'experimental' | 'incubating' | 'validated' | 'launched' | 'deprecated';
  description: string;
  estimatedTVL?: number;
  estimatedUsers?: number;
  dependencies: string[];
  createdAt: number;
}

// ─── Memory / history ─────────────────────────────────────────────────────────

export type CivilizationEventType =
  | 'governance_outcome'
  | 'economic_decision'
  | 'network_event'
  | 'ecosystem_growth'
  | 'treaty_signed'
  | 'treaty_expired'
  | 'expansion_launched'
  | 'swarm_deliberation'
  | 'consciousness_cycle';

export interface CivilizationEvent {
  id: string;
  type: CivilizationEventType;
  description: string;
  payload: Record<string, unknown>;
  timestamp: number;
  significance: 'low' | 'medium' | 'high' | 'historic';
}

// ─── Decision synthesis ───────────────────────────────────────────────────────

export interface DecisionInput {
  state: EcosystemState;
  awareness: AwarenessReport;
  swarmVotes?: SwarmDeliberation[];
  activeTreaties?: Treaty[];
  recentEvents?: CivilizationEvent[];
}

export interface SynthesizedDecision {
  directive: CoordinationDirective;
  confidence: number;           // 0-1
  rationale: string;
  subDirectives: string[];
  requiredActions: string[];
  expectedOutcome: string;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export type TelemetrySeverity = 'debug' | 'info' | 'warn' | 'critical';

export interface ConsciousnessTelemetryRecord {
  signal: string;
  value: unknown;
  severity: TelemetrySeverity;
  layer: string;
  timestamp: number;
}
