/**
 * GhostBrain Core — Autonomous Code Guardian (ACG) Types
 *
 * Every code-change lifecycle object lives here.
 * Infrastructure types (Incident, ChangePlan, etc.) remain in ../types.ts.
 */

// ─── Risk levels ──────────────────────────────────────────────────────────────
export type RiskLevel = "low" | "medium" | "high" | "critical";

// ─── Rollout strategies ───────────────────────────────────────────────────────
export type RolloutStrategy = "none" | "canary" | "staged" | "blue-green";

// ─── Change Proposal status ───────────────────────────────────────────────────
export type ProposalStatus =
  | "draft"
  | "planning"
  | "pending-gates"
  | "gates-passed"
  | "gates-failed"
  | "executing"
  | "completed"
  | "rolled-back"
  | "aborted";

// ─── Gate types ───────────────────────────────────────────────────────────────
export type GateKind =
  | "code-quality"
  | "test"
  | "security"
  | "supply-chain"
  | "change-risk"
  | "routing-law"
  | "build";

export type GateStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface GateCheck {
  kind: GateKind;
  status: GateStatus;
  startedAt?: string;
  completedAt?: string;
  output: string;
  findings: GateFinding[];
}

export interface GateFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  rule: string;
  file?: string;
  line?: number;
  message: string;
  remediation?: string;
}

export interface GateRunResult {
  kind: GateKind;
  passed: boolean;
  durationMs: number;
  findings: GateFinding[];
  output: string;
}

// ─── Diff / Patch ─────────────────────────────────────────────────────────────
export type DiffOperation = "add" | "modify" | "delete" | "rename";

export interface FileDiff {
  operation: DiffOperation;
  path: string;           // repo-relative path
  oldPath?: string;       // for renames
  patch: string;          // unified diff
  rationale: string;
}

export interface PatchPlan {
  patchId: string;
  proposalId: string;
  createdAt: string;
  title: string;
  diffs: FileDiff[];
  commandsToRun: string[];
  testPlan: string[];
  estimatedBlastRadius: number;
}

// ─── Change Proposal ──────────────────────────────────────────────────────────
export interface ChangeProposalInput {
  goal: string;
  scope: string[];           // service names, file paths, or "all"
  triggeredBy: "user" | "sentinel" | "scheduler" | "dependency-bot" | "security-scanner";
  triggeredByRef?: string;   // incident ID, CVE ID, etc.
}

export interface ChangeProposal {
  proposalId: string;
  createdAt: string;
  updatedAt: string;
  status: ProposalStatus;

  // Input
  goal: string;
  scope: string[];
  triggeredBy: ChangeProposalInput["triggeredBy"];
  triggeredByRef?: string;

  // Plan
  riskLevel: RiskLevel;
  rationale: string;
  acceptanceCriteria: string[];
  testPlan: string[];
  securityPlan: string[];
  rolloutStrategy: RolloutStrategy;
  rollbackPlan: string[];

  // Patch
  patchPlan?: PatchPlan;

  // Gates
  gates: GateCheck[];

  // Release
  branchName?: string;
  prUrl?: string;
  releaseArtifact?: ReleaseArtifact;

  // Evidence
  evidenceLog: ProposalEvent[];
}

// ─── Release artifacts ────────────────────────────────────────────────────────
export interface ReleaseArtifact {
  artifactId: string;
  proposalId: string;
  version: string;
  createdAt: string;
  sbom?: Record<string, unknown>;        // CycloneDX or SPDX JSON
  provenance?: Record<string, unknown>;  // SLSA provenance
  imageDigests: Record<string, string>;  // service → sha256
  containerScanResult?: AuditResult;
}

// ─── Security audit result ────────────────────────────────────────────────────
export type AuditToolKind =
  | "semgrep"        // SAST
  | "codeql"         // SAST (GitHub)
  | "trivy"          // container + IaC + deps
  | "grype"          // container CVE
  | "slither"        // Solidity
  | "echidna"        // Solidity fuzz
  | "gitleaks"       // secret scan
  | "npm-audit"      // JS deps
  | "pnpm-audit"     // JS deps (pnpm)
  | "pip-audit"      // Python deps
  | "osv-scanner";   // multi-ecosystem

export interface AuditResult {
  tool: AuditToolKind;
  ranAt: string;
  exitCode: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: GateFinding[];
  rawOutputRef?: string;  // path or storage key
}

// ─── Test / QA result ─────────────────────────────────────────────────────────
export interface TestSuiteResult {
  suite: string;                 // e.g. "unit", "integration", "e2e", "fuzz"
  passed: number;
  failed: number;
  skipped: number;
  coveragePct?: number;
  coverageDelta?: number;        // positive = improved
  durationMs: number;
  failedTests: string[];
}

// ─── Post-deploy sentinel state ───────────────────────────────────────────────
export type SentinelAction = "none" | "hotfix-proposal" | "auto-rollback" | "alert";

export interface SentinelObservation {
  observationId: string;
  proposalId: string;
  observedAt: string;
  windowSeconds: number;
  sloViolations: SloViolation[];
  errorRateBaseline: number;
  errorRateCurrent: number;
  latencyP99Baseline: number;
  latencyP99Current: number;
  action: SentinelAction;
  actionReason?: string;
}

export interface SloViolation {
  slo: string;
  target: number;
  current: number;
  severity: "warn" | "breach";
}

// ─── Proposal event log ───────────────────────────────────────────────────────
export interface ProposalEvent {
  eventId: string;
  occurredAt: string;
  phase: string;   // e.g. "gate:security", "execute", "sentinel"
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

// ─── NATS subjects ────────────────────────────────────────────────────────────
export const ACG_SUBJECTS = {
  PROPOSAL_CREATED:     "acg.proposal.created",
  PROPOSAL_UPDATED:     "acg.proposal.updated",
  GATE_REQUEST:         "acg.gate.request",
  GATE_RESULT:          "acg.gate.result",
  PATCH_REQUEST:        "acg.patch.request",
  PATCH_RESULT:         "acg.patch.result",
  AUDIT_REQUEST:        "acg.audit.request",
  AUDIT_RESULT:         "acg.audit.result",
  TEST_REQUEST:         "acg.test.request",
  TEST_RESULT:          "acg.test.result",
  BUILD_REQUEST:        "acg.build.request",
  BUILD_RESULT:         "acg.build.result",
  RELEASE_REQUEST:      "acg.release.request",
  RELEASE_RESULT:       "acg.release.result",
  SENTINEL_OBSERVATION: "acg.sentinel.observation",
  HOTFIX_PROPOSAL:      "acg.hotfix.proposal",
} as const;
