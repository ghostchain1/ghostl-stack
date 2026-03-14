// GhostBrain APE — shared types for the full analysis → simulation → proposal chain

export type ImprovementType =
  | 'gas_optimization'
  | 'block_time_reduction'
  | 'validator_rebalancing'
  | 'throughput_increase';

export type AnalysisSource = 'performance' | 'gas' | 'validator';

export interface AnalysisResult {
  improvementDetected: boolean;
  type?: ImprovementType;
  source: AnalysisSource;
  /** Observed scalar metric value (gas%, block ms, imbalance%) */
  value?: number;
  detail: string;
  ts: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface SimulationResult {
  success: boolean;
  /** 0–100 */
  successRate: number;
  proposedChange: string;
  estimatedImprovementPct: number;
  riskLevel: RiskLevel;
  analysis: AnalysisResult;
  simulationId: string;
}

export type ProposalStatus = 'pending' | 'submitted' | 'submit_failed';

export interface EvolutionProposal {
  id: string;
  title: string;
  description: string;
  type: ImprovementType | string;
  estimatedImprovementPct: number;
  riskLevel: RiskLevel;
  simulationId: string;
  triggerValue?: number;
  source: 'ghost-protocol-evolution';
  /** All proposals must be ratified by human governance — no autonomous deployment */
  requiresGovernanceApproval: true;
  status: ProposalStatus;
  createdAt: string;
}
