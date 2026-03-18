export type RuntimeEnvironment = "devnet" | "testnet" | "mainnet";

export type UnitKind = "vm" | "service" | "chain" | "bridge" | "agent";

export type LayerKind = "hypervisor" | "l1" | "l2" | "l3" | "ai" | "ops";

export type HealthStatus = "ok" | "warn" | "fail";

export type DesiredState = "running" | "stopped" | "degraded" | "maintenance";

export type ActualState = DesiredState | "failed";

export type ActionClass = "safe-auto" | "approval-required" | "forbidden";

export interface UnitHealth {
  status: HealthStatus;
  rpc: boolean | null;
  lastCheckAt: string | null;
  detail?: string;
}

export interface UnitChecks {
  rpcUrl?: string;
  healthPath?: string;
}

export interface UnitGovernancePolicy {
  actionClass: ActionClass;
  advisoryProposalType?: string;
}

export interface UnitManifestEntry {
  id: string;
  name: string;
  kind: UnitKind;
  layer: LayerKind;
  env: RuntimeEnvironment;
  desiredState: DesiredState;
  dependencies: string[];
  governance: UnitGovernancePolicy;
  checks?: UnitChecks;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ManagedUnit extends UnitManifestEntry {
  actualState: ActualState;
  health: UnitHealth;
}

export interface UnitManifestDocument {
  env: RuntimeEnvironment;
  generatedBy: string;
  units: UnitManifestEntry[];
}
