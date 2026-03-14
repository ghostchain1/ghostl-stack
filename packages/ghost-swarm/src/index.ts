// ghost-swarm — public API

// Types
export type {
  SwarmEvent,
  SwarmEventHandler,
  SwarmNodeInfo,
  Proposal,
  ConsensusResult,
  PredictionMetrics,
  FailureHistory,
  Region,
  RoutingRequest,
} from './types.js';

// Swarm layer
export { GhostSwarmController } from './swarm/GhostSwarmController.js';
export { GhostSwarmNode } from './swarm/GhostSwarmNode.js';
export { GhostSwarmRegistry } from './swarm/GhostSwarmRegistry.js';

// Consensus layer
export { GhostDecisionConsensus } from './consensus/GhostDecisionConsensus.js';
export { GhostProposalAggregator } from './consensus/GhostProposalAggregator.js';

// Agents
export { GhostAgentBase } from './agents/GhostAgentBase.js';
export { GhostRepairAgent } from './agents/GhostRepairAgent.js';
export { GhostScalingAgent } from './agents/GhostScalingAgent.js';
export { GhostSecurityAgent } from './agents/GhostSecurityAgent.js';
export { GhostGovernanceAgent } from './agents/GhostGovernanceAgent.js';

// Prediction layer
export { GhostPredictiveEngine } from './prediction/GhostPredictiveEngine.js';
export { GhostFailurePredictor } from './prediction/GhostFailurePredictor.js';
export type { PredictionResult } from './prediction/GhostPredictiveEngine.js';
export type { DegradationLevel } from './prediction/GhostFailurePredictor.js';

// Multi-region
export { GhostRegionController } from './multi-region/GhostRegionController.js';
export { GhostRegionBalancer } from './multi-region/GhostRegionBalancer.js';

// Telemetry
export { GhostSwarmTelemetry } from './telemetry/GhostSwarmTelemetry.js';
export type { TelemetryRecord, TelemetrySink } from './telemetry/GhostSwarmTelemetry.js';
