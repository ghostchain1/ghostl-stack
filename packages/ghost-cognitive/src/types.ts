// types.ts — shared type definitions for ghost-cognitive

export interface MemoryEntry<T = unknown> {
  id: string;
  timestamp: number;
  category: string;
  data: T;
  tags?: string[];
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

export interface EconomicMetrics {
  tvlGrowth: number;       // percentage
  gasFees: number;         // gwei or token units
  transactionVolume: number;
  treasuryBalance: number;
  tokenPrice: number;
  tokenTarget: number;
  bridgeLiquidity: number;
  networkDemand: number;
}

export interface MarketData {
  price: number;
  target: number;
  volatility: number;
  volume24h: number;
}

export interface TreasuryAllocation {
  validators: number;
  development: number;
  liquidity: number;
  reserve: number;
}

export interface TokenomicsAction {
  action: 'reduce_emissions' | 'increase_liquidity' | 'hold' | 'increase_emissions';
  reason: string;
  magnitude?: number;
}

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  cost: number;
  benefit: number;
  category: string;
  payload?: Record<string, unknown>;
}

export interface PolicySimulationResult {
  impact: 'positive' | 'neutral' | 'negative';
  risk: 'low' | 'medium' | 'high';
  estimatedCost: number;
  estimatedBenefit: number;
  recommendation: 'approve' | 'reject' | 'amend';
  notes: string[];
}

export interface StrategicRoadmap {
  horizon: string;
  initiatives: StrategicInitiative[];
}

export interface StrategicInitiative {
  title: string;
  priority: 'high' | 'medium' | 'low';
  estimatedQuarters: number;
  description: string;
}
