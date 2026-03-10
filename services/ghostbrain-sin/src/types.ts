// GhostBrain SIN — Sovereign Intelligence Network shared types
// All outputs are DETECT/DRAFT only; every proposal requires human governance ratification.

export type UpgradeCategory =
  | 'consensus-parameter'
  | 'evm-version'
  | 'opstack-version'
  | 'bridge-upgrade'
  | 'gas-model';

export type GovernanceCategory =
  | 'validator-distribution'
  | 'regional-scaling'
  | 'treasury-allocation'
  | 'protocol-upgrade'
  | 'parameter-change';

// ── Governance drafting ───────────────────────────────────────────────────────

export interface GovernanceDraft {
  id:          string;
  category:    GovernanceCategory;
  title:       string;
  summary:     string;
  rationale:   string;
  payload:     Record<string, unknown>;
  confidence:  number;               // 0–1, AI self-assessment
  draftedAt:   number;
  requiresHumanRatification: true;
}

// ── GST economic policy ───────────────────────────────────────────────────────

export interface GstPolicy {
  currentSupply:           string;   // wei as string (bigint-safe)
  circulatingSupply:       string;
  inflationRatePct:        number;
  targetInflationPct:      number;
  burnRatePct:             number;
  recommendation:          'increase-burn' | 'decrease-issuance' | 'stable' | 'increase-issuance';
  rationale:               string;
  proposedAdjustmentPct:   number;   // signed %, relative to current
}

// ── Treasury allocation ───────────────────────────────────────────────────────

export interface TreasuryAllocationEntry {
  purpose:     string;
  currentPct:  number;
  proposedPct: number;
  deltaGst:    string;               // wei as string
  rationale:   string;
}

export interface TreasuryAllocation {
  totalTreasuryGst:     string;
  allocations:          TreasuryAllocationEntry[];
  expectedAnnualYieldPct: number;
}

// ── Protocol upgrades ─────────────────────────────────────────────────────────

export interface ProtocolUpgradeProposal {
  id:                    string;
  upgradeType:           UpgradeCategory;
  description:           string;
  targetChain:           'L1' | 'L2' | 'L3' | 'all';
  riskLevel:             'low' | 'medium' | 'high';
  estimatedImpact:       string;
  requiresGovernanceQuorum: number; // fraction, e.g. 0.67
}

// ── Distributed AI learning ───────────────────────────────────────────────────

export type LearningEventType =
  | 'pattern-discovered'
  | 'anomaly-flagged'
  | 'model-updated'
  | 'insight-shared';

export interface LearningEvent {
  id:          string;
  type:        LearningEventType;
  regionId:    string;
  description: string;
  confidence:  number;
  ts:          number;
}

// ── Voting advisor ────────────────────────────────────────────────────────────

export interface VoteAdvice {
  proposalId:     string;
  title:          string;
  recommendation: 'support' | 'oppose' | 'abstain';
  confidence:     number;   // 0–1
  reason:         string;
  advisedAt:      number;
}

// ── Liquidity policy ──────────────────────────────────────────────────────────

export interface LiquidityRoute {
  id:        string;
  from:      'L1' | 'L2' | 'L3';
  to:        'L1' | 'L2' | 'L3';
  amountGst: string;   // wei as string (bigint-safe)
  reason:    string;
}

export interface LiquidityPolicyResult {
  l1LiquidityPct: number;
  l2LiquidityPct: number;
  l3LiquidityPct: number;
  routes:         LiquidityRoute[];
  analysedAt:     number;
}

// ── Upgrade blueprints ────────────────────────────────────────────────────────

export interface UpgradeBlueprint {
  id:                   string;
  upgradeType:          UpgradeCategory;
  targetChain:          'L1' | 'L2' | 'L3' | 'all';
  migrationSteps:       string[];
  rollbackPlan:         string;
  estimatedWindowHours: number;
  riskMitigation:       string;
  createdAt:            number;
}

// ── Security policy ───────────────────────────────────────────────────────────

export type SecurityDomain =
  | 'validator-collusion'
  | 'governance-attack'
  | 'bridge-exploit'
  | 'token-concentration';

export interface SecurityPolicyResult {
  id:           string;
  domain:       SecurityDomain;
  severity:     'low' | 'medium' | 'high' | 'critical';
  description:  string;
  policyUpdate: string;
  evaluatedAt:  number;
}

// ── Service snapshot ──────────────────────────────────────────────────────────

export interface SINSnapshot {
  cycleAt:             number;
  governanceDrafts:    GovernanceDraft[];
  gstPolicy:           GstPolicy | null;
  treasuryAllocation:  TreasuryAllocation | null;
  protocolProposals:   ProtocolUpgradeProposal[];
  learningEvents:      LearningEvent[];
  // Phase 118-135 additions
  voteAdvice:          VoteAdvice[];
  liquidityPolicy:     LiquidityPolicyResult | null;
  upgradeBlueprints:   UpgradeBlueprint[];
  securityPolicies:    SecurityPolicyResult[];
  totalProposals:      number;
  dryRun:              boolean;
}

export interface SINProposal {
  id:          string;
  type:        'governance-draft' | 'gst-policy' | 'treasury-reallocation' | 'protocol-upgrade'
             | 'liquidity-routing' | 'security-policy' | 'upgrade-blueprint';
  description: string;
  payload:     Record<string, unknown>;
  urgency:     'critical' | 'high' | 'medium' | 'low';
  createdAt:   number;
  requiresHumanRatification: true;
}
