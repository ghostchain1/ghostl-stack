// ghost-cognitive — public API

// Types
export type {
  MemoryEntry,
  KnowledgeEdge,
  EconomicMetrics,
  MarketData,
  TreasuryAllocation,
  TokenomicsAction,
  GovernanceProposal,
  PolicySimulationResult,
  StrategicRoadmap,
  StrategicInitiative,
} from './types.js';

// Memory layer
export { GhostMemoryStore } from './memory/GhostMemoryStore.js';
export { GhostKnowledgeGraph } from './memory/GhostKnowledgeGraph.js';
export { GhostLearningEngine } from './memory/GhostLearningEngine.js';
export type { LearningEvent, LearningInsight } from './memory/GhostLearningEngine.js';

// Economy layer
export { GhostEconomicAI } from './economy/GhostEconomicAI.js';
export { GhostTreasuryStrategist } from './economy/GhostTreasuryStrategist.js';
export { GhostMarketAnalyzer } from './economy/GhostMarketAnalyzer.js';
export type { EconomicRecommendation } from './economy/GhostEconomicAI.js';
export type { MarketSignal } from './economy/GhostMarketAnalyzer.js';

// Tokenomics layer
export { GhostTokenomicsController } from './tokenomics/GhostTokenomicsController.js';
export { GhostBurnStrategyAI } from './tokenomics/GhostBurnStrategyAI.js';
export { GhostSupplyBalancer } from './tokenomics/GhostSupplyBalancer.js';

// Governance layer
export { GhostPredictiveGovernance } from './governance/GhostPredictiveGovernance.js';
export { GhostPolicySimulator } from './governance/GhostPolicySimulator.js';
export type { GovernanceVerdict } from './governance/GhostPredictiveGovernance.js';

// Cognition layer
export { GhostCognitiveEngine } from './cognition/GhostCognitiveEngine.js';
export { GhostStrategicPlanner } from './cognition/GhostStrategicPlanner.js';

// Telemetry
export { GhostCognitiveTelemetry } from './telemetry/GhostCognitiveTelemetry.js';
export type { CognitiveRecord, CognitiveSink } from './telemetry/GhostCognitiveTelemetry.js';
