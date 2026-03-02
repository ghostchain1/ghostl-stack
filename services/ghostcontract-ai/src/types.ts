/**
 * GhostContractAI — Shared Pipeline Types
 */

export type PipelineStatus = "pending" | "running" | "succeeded" | "failed" | "dry_run";

export type PipelineType =
  | "compile-test"
  | "security-audit"
  | "deploy"
  | "upgrade"
  | "verify"
  | "rollback";

export interface PipelineRecord {
  id: string;
  type: PipelineType;
  status: PipelineStatus;
  chain: string;           // "L1" | "L2" | "L3"
  dryRun: boolean;
  createdAt: string;       // ISO8601
  startedAt?: string;
  finishedAt?: string;
  result?: PipelineResult;
  error?: string;
  auditLog: AuditLogEntry[];
}

export interface PipelineResult {
  success: boolean;
  summary: string;
  artifacts?: Record<string, string>;  // artifactName → content/path
  riskScore?: number;
  evidencePack?: EvidencePack;
  txHash?: string;
  contractAddress?: string;
}

export interface AuditLogEntry {
  ts: string;
  actor: string;           // JWT sub or service identity
  action: string;
  detail?: string;
}

// ─── Evidence Pack ───────────────────────────────────────────────────────────

export interface EvidencePack {
  pipelineId: string;
  generatedAt: string;
  chain: string;
  buildManifest: BuildManifest;
  testReport: TestReport;
  slitherReport: SlitherReport;
  policyGateProof: PolicyGateProof;
  approvalChain: ApprovalRecord[];
  deploymentReceipt?: DeploymentReceipt;
}

export interface BuildManifest {
  contractName: string;
  version: string;
  gitCommit: string;
  bytecodeHash: string;
  abiHash: string;
  buildProfile: string;
  compiledAt: string;
}

export interface TestReport {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;        // ms
  invariantsPassed: boolean;
  rawSummary: string;
}

export interface SlitherReport {
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  informational: number;
  rawSummary: string;
  passed: boolean;         // true if no high/medium findings
}

export interface PolicyGateProof {
  namespace: string;
  policyHash: string;
  policyVersion: number;
  verified: boolean;
  verifiedAt: string;
}

export interface ApprovalRecord {
  approver: string;
  role: string;
  approvedAt: string;
  signatureRef?: string;   // SLSA signer reference or Vault key ID
}

export interface DeploymentReceipt {
  txHash: string;
  blockNumber: number;
  contractAddress?: string;
  chain: string;
  deployedAt: string;
}

// ─── Request/Response types ─────────────────────────────────────────────────

export interface DeployRequest {
  chain: "L1" | "L2" | "L3";
  contractName: string;
  version: string;
  gitCommit?: string;
  deployerRole?: string;   // for routing law enforcement
  policyNamespace: string;
  policyHash: string;
  dryRun?: boolean;
}

export interface UpgradeRequest {
  chain: "L1" | "L2" | "L3";
  proxyAddress: string;
  newImplementation?: string;  // omitted for proposal-only
  description: string;
  policyNamespace: string;
  policyHash: string;
  riskScore?: number;
  dryRun?: boolean;
}

export interface AuditRequest {
  contractPath: string;      // relative to contracts/
  contractName: string;
}

export interface CompileTestRequest {
  contractPath?: string;
  profile?: string;
  runInvariants?: boolean;
}
