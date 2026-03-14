// ghost-consciousness — public SDK API (GCL-Ω)

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // Ecosystem state
  NetworkHealth,
  EconomicStatus,
  ExpansionSignal,
  CoordinationDirective,
  EcosystemState,
  ConsciousnessSnapshot,
  // Awareness
  AwarenessReport,
  InfrastructureAwareness,
  // Swarm
  SwarmVote,
  SwarmAgent,
  SwarmIssue,
  SwarmDeliberation,
  MediationResult,
  // Diplomacy
  TreatyType,
  CrossChainTarget,
  Treaty,
  TreatyTerms,
  NegotiationProposal,
  // Expansion
  ExpansionAction,
  EcosystemMetrics,
  ExpansionPlan,
  ProtocolProposal,
  // Memory
  CivilizationEventType,
  CivilizationEvent,
  // Decision
  DecisionInput,
  SynthesizedDecision,
  // Telemetry
  TelemetrySeverity,
  ConsciousnessTelemetryRecord,
} from './types.js';

// ─── Consciousness ────────────────────────────────────────────────────────────
export { GhostConsciousnessCore } from './consciousness/GhostConsciousnessCore.js';
export { GhostAwarenessEngine } from './consciousness/GhostAwarenessEngine.js';

// ─── Coordination ─────────────────────────────────────────────────────────────
export { GhostGlobalCoordinator } from './coordination/GhostGlobalCoordinator.js';
export { GhostDecisionSynthesizer } from './coordination/GhostDecisionSynthesizer.js';

// ─── Swarm Intelligence ───────────────────────────────────────────────────────
export { GhostSwarmCouncil } from './swarm-intelligence/GhostSwarmCouncil.js';
export { GhostSwarmMediator } from './swarm-intelligence/GhostSwarmMediator.js';

// ─── Diplomacy ────────────────────────────────────────────────────────────────
export { GhostCrossChainDiplomat } from './diplomacy/GhostCrossChainDiplomat.js';
export { GhostTreatyEngine } from './diplomacy/GhostTreatyEngine.js';

// ─── Expansion ────────────────────────────────────────────────────────────────
export { GhostEcosystemExpander } from './expansion/GhostEcosystemExpander.js';
export { GhostProtocolIncubator } from './expansion/GhostProtocolIncubator.js';

// ─── Perception ───────────────────────────────────────────────────────────────
export { GhostSystemPerception } from './perception/GhostSystemPerception.js';

// ─── Memory ───────────────────────────────────────────────────────────────────
export { GhostCivilizationMemory } from './memory/GhostCivilizationMemory.js';

// ─── Telemetry ────────────────────────────────────────────────────────────────
export { GhostConsciousnessTelemetry } from './telemetry/GhostConsciousnessTelemetry.js';
export type { TelemetrySink } from './telemetry/GhostConsciousnessTelemetry.js';
