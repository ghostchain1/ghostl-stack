export type RiskMode = "SAFE" | "GATED" | "APPROVAL" | "GOVERNANCE";

export type Layer = "l1" | "l2" | "l3";

export type ActionKind =
  | "docker.restart_service"
  | "docker.restart_container"
  | "health.rpc_probe"
  | "gates.run_commands";

export type GateKind = "command";

export type ActionStatus = "queued" | "running" | "succeeded" | "failed";

export interface Incident {
  id: string;
  createdAt: string;
  source: string;
  severity: "info" | "warn" | "error" | "critical";
  signature: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface ActionRequest {
  id: string;
  createdAt: string;
  requestedBy: string;
  reason?: string | null;
  riskMode: RiskMode;
  scope: ActionScope;
  requestedActions: ProposedAction[];
  status: ActionStatus;
}

export interface ActionScope {
  workspaceRoot: string;
  layers?: Layer[];
  services?: string[];
}

export interface ProposedAction {
  kind: ActionKind;
  params: Record<string, unknown>;
}

export interface CommandGate {
  kind: "command";
  name: string;
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  dryRun?: boolean;
}

export interface ActionBundle {
  id: string;
  createdAt: string;
  expiresAt: string;
  riskMode: RiskMode;
  scope: ActionScope;
  actions: ProposedAction[];
  gates: CommandGate[];
  rollback: {
    strategy: "git_revert" | "none";
    ref?: string;
  };
  evidencePlan: {
    writeEvidenceJson: boolean;
  };
}

export interface SignedActionBundle {
  algorithm: "ed25519";
  keyId: string;
  bundle: ActionBundle;
  signatureB64: string;
}

