// GhostBrain Strategic Intelligence System — shared types

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface ForecastResult {
  metric:           string;
  value:            number;        // 0–100 normalized score
  level:            RiskLevel;
  detail:           string;
  recommendation?:  string;
  ts:               string;
}

export interface TokenomicsSnapshot {
  supply:           number;        // total GST supply
  circulatingPct:   number;        // % of supply in circulation
  burnRate:         number;        // annual burn % of supply
  stakingAPR:       number;        // staking yield %
  inflationRate:    number;        // net inflation %
  burnRecommended:  boolean;
  burnDeltaRec?:    number;        // suggested burn-rate change (percentage points)
  ts:               string;
}

export interface TreasuryProjection {
  gstReserve:         number;      // current GST reserve
  projectedRevenue:   number;      // 30-day forward GST income
  projectedExpenses:  number;      // 30-day forward GST outflow
  liquidityShortfall: number;      // forecast shortfall as % of reserve
  stakingRewards:     number;      // 30-day staking reward outflow
  recommendation?:    string;
  ts:                 string;
}

export interface LiquidityModel {
  l1Balance:       number;         // GST held on L1
  l2Balance:       number;         // GST held on L2
  l3Balance:       number;         // GST held on L3
  imbalancePct:    number;         // deviation from target cross-chain split
  rebalanceAction?: string;
  ts:              string;
}

export interface RoutingResult {
  l1Pct:    number;
  l2Pct:    number;
  l3Pct:    number;
  optimal:  boolean;
  actions:  string[];
  ts:       string;
}

export interface BridgeResult {
  l1l2LatencyMs:  number;
  l2l3LatencyMs:  number;
  congestionPct:  number;
  actions:        string[];
  ts:             string;
}

export interface ScalingPlan {
  currentLoadPct:  number;
  projectedLoadPct:number;         // 30-minute horizon
  recommendAction: boolean;
  action?:         string;
  ts:              string;
}

export interface NodeExpansionPlan {
  rpcNodeCount:    number;
  validatorCount:  number;
  archiveNodeCount:number;
  expansion:       string[];
  ts:              string;
}

export interface StrategySnapshot {
  networkForecast:   ForecastResult;
  gasForecast:       ForecastResult;
  validatorForecast: ForecastResult;
  treasuryForecast:  TreasuryProjection;
  liquidityModel:    LiquidityModel;
  routingResult:     RoutingResult;
  bridgeResult:      BridgeResult;
  scalingPlan:       ScalingPlan;
  nodeExpansion:     NodeExpansionPlan;
  tokenomics:        TokenomicsSnapshot;
  recommendations:   string[];
  riskLevel:         RiskLevel;
  generatedAt:       string;
}

export interface StrategyProposal {
  id:          string;
  title:       string;
  description: string;
  risk:        RiskLevel;
  action:      string;
  module:      string;
  payload:     Record<string, unknown>;
  status:      'pending' | 'submitted' | 'dry_run' | 'submit_failed';
  createdAt:   string;
}
