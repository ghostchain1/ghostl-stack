// AI
export { GhostAICodeRepair }      from "./ai/GhostAICodeRepair.js";
export type { CodeRepairResult }  from "./ai/GhostAICodeRepair.js";
export { GhostAIContractRepair }  from "./ai/GhostAIContractRepair.js";
export type { ContractRepairResult } from "./ai/GhostAIContractRepair.js";
export { GhostAIGovernanceEngine } from "./ai/GhostAIGovernanceEngine.js";
export type { GovernanceMetrics, GovernanceProposal } from "./ai/GhostAIGovernanceEngine.js";

// CI/CD
export { GhostAICICD }          from "./cicd/GhostAICICD.js";
export type { Pipeline, PipelineStage } from "./cicd/GhostAICICD.js";
export { GhostPipelineBuilder } from "./cicd/GhostPipelineBuilder.js";
export { GhostDeploymentBot }   from "./cicd/GhostDeploymentBot.js";
export type { DeployResult }    from "./cicd/GhostDeploymentBot.js";

// Scaling
export { GhostNodeScaler }   from "./scaling/GhostNodeScaler.js";
export type { ScaleDecision, ScaleEvaluation } from "./scaling/GhostNodeScaler.js";
export { GhostLoadAnalyzer } from "./scaling/GhostLoadAnalyzer.js";
export type { LoadMetrics }  from "./scaling/GhostLoadAnalyzer.js";

// Validators
export { GhostValidatorSupervisor } from "./validators/GhostValidatorSupervisor.js";
export type { NodeConfig }          from "./validators/GhostValidatorSupervisor.js";
export { GhostValidatorSelfHeal }   from "./validators/GhostValidatorSelfHeal.js";

// Governance
export { GhostGovernanceProposalAI } from "./governance/GhostGovernanceProposalAI.js";
export { GhostProposalSimulator }    from "./governance/GhostProposalSimulator.js";
export type { SimulationResult }     from "./governance/GhostProposalSimulator.js";

// Orchestration
export { GhostOrchestrator }    from "./orchestration/GhostOrchestrator.js";
export type { OrchestratorConfig } from "./orchestration/GhostOrchestrator.js";
export { GhostAgentController } from "./orchestration/GhostAgentController.js";
export type { Agent }           from "./orchestration/GhostAgentController.js";

// Monitoring
export { GhostTelemetry }    from "./monitoring/GhostTelemetry.js";
export type { MetricRecord } from "./monitoring/GhostTelemetry.js";
export { GhostHealthMonitor } from "./monitoring/GhostHealthMonitor.js";
export type { HealthStatus }  from "./monitoring/GhostHealthMonitor.js";
