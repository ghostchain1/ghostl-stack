/**
 * GhostContractAI — Autonomous Job Types
 *
 * These extend the pipeline types with a structured job API
 * consumed by the orchestrator and GhostBrain Core.
 */

// ─── Job Types ────────────────────────────────────────────────────────────────

export type JobType =
  | "CONTRACT_CREATE"
  | "CONTRACT_FIX"
  | "CONTRACT_UPGRADE"
  | "CONTRACT_COMPILE"
  | "CONTRACT_AUDIT";

export type JobStatus =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "dry_run_complete";

// ─── Job Request ──────────────────────────────────────────────────────────────

export interface JobConstraints {
  maxFilesRead?: number;          // default 50
  maxBytesPerFile?: number;       // default 1 MB
  maxTotalBytes?: number;         // default 16 MB
  maxPatchBytes?: number;         // default 2 MB
  jobTimeoutMs?: number;          // default 900_000 (15 min)
  childTimeoutMs?: number;        // default 600_000 (10 min)
  dryRun?: boolean;               // if true: plan only, no writes
  concurrency?: 1 | 2;           // child process concurrency
}

export interface JobContext {
  /** Human-readable mission description */
  description?: string;
  /** Specific contract name(s) to focus on */
  contractNames?: string[];
  /** Template to use for CONTRACT_CREATE */
  templateId?: string;
  /** Template parameters for CONTRACT_CREATE */
  templateParams?: Record<string, string>;
  /** Target file path (relative to contracts dir) for CREATE/FIX */
  targetPath?: string;
  /** Upgrade strategy for CONTRACT_UPGRADE */
  upgradeStrategy?: "uups" | "transparent" | "beacon";
  /** Governor approval reference (required for non-dry-run upgrades/deploys) */
  governorApprovalRef?: string;
  /** Additional ripgrep query to narrow search */
  searchQuery?: string;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  targetPaths: string[];       // absolute paths within allowed roots
  constraints: JobConstraints;
  context: JobContext;
  initiator: string;           // JWT sub or "ghostbrain-core"
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  planSteps?: PlanStep[];
  result?: JobResult;
  error?: string;
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  label: string;
  tool: string;                // "forge_build" | "slither" | "ripgrep" | "fs_read" | "patch" | ...
  args: Record<string, unknown>;
  status: "pending" | "running" | "done" | "skipped" | "failed";
  startedAt?: string;
  finishedAt?: string;
  output?: string;
}

export interface Plan {
  jobId: string;
  steps: PlanStep[];
  estimatedMs?: number;
  warnings?: string[];
}

// ─── Job Result ───────────────────────────────────────────────────────────────

export interface TouchedFile {
  path: string;
  sha256Before?: string;
  sha256After?: string;
  action: "created" | "modified" | "deleted" | "read";
}

export interface JobEvidence {
  jobId: string;
  generatedAt: string;
  toolVersions: Record<string, string>;   // forge, solc, slither, ...
  touchedFiles: TouchedFile[];
  patchDiff?: string;                     // capped at maxPatchBytes
  compileLogs?: string;
  testLogs?: string;
  auditLogs?: string;
  sha256Manifest: string;                 // SHA-256 of this evidence object (self-referential after sealing)
  signature?: string;                     // optional Vault/HMAC signature
}

export interface JobResult {
  success: boolean;
  summary: string;
  buildPassed?: boolean;
  testPassed?: boolean;
  slitherHighFindings?: number;
  riskScore?: number;
  patchDiff?: string;
  upgradeProposal?: UpgradeProposal;
  createdContract?: CreatedContract;
  evidence?: JobEvidence;
  artifacts?: Record<string, string>;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface WorkspaceState {
  jobId: string;
  workDir: string;             // temp scratch dir for this job
  allowedRoots: string[];
  bytesRead: number;
  bytesReadLimit: number;
  filesRead: number;
  filesReadLimit: number;
  startedAt: number;           // Date.now()
  timeoutMs: number;
}

// ─── Domain models ────────────────────────────────────────────────────────────

export interface UpgradeProposal {
  strategy: "uups" | "transparent" | "beacon";
  currentImplementation: string;
  newImplementation: string;
  storageLayoutDiff: StorageSlotDiff[];
  migrationScript?: string;
  breakingChanges: string[];
  governorApprovalRequired: boolean;
}

export interface StorageSlotDiff {
  slot: number;
  label: string;
  typeBefore: string;
  typeAfter: string;
  compatible: boolean;
}

export interface CreatedContract {
  templateId: string;
  contractName: string;
  targetPath: string;
  patchDiff: string;
}

// ─── API DTOs ─────────────────────────────────────────────────────────────────

export interface CreateJobRequest {
  type: JobType;
  targetPaths: string[];
  constraints?: Partial<JobConstraints>;
  context?: JobContext;
}

export interface CreateJobResponse {
  id: string;
  status: JobStatus;
  createdAt: string;
}

export interface GetJobResponse extends Job {}

// ─── Internal queue item ──────────────────────────────────────────────────────

export interface QueueItem {
  jobId: string;
  enqueuedAt: number;
}
