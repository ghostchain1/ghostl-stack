/**
 * GhostBrain SDK — Shared Types for GhostContractAI job API
 * Mirrors services/ghostcontract-ai/src/types/jobs.ts (no import cycle).
 */

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

export interface JobConstraints {
  maxFilesRead?: number;
  maxBytesPerFile?: number;
  maxTotalBytes?: number;
  maxPatchBytes?: number;
  jobTimeoutMs?: number;
  childTimeoutMs?: number;
  dryRun?: boolean;
  concurrency?: 1 | 2;
}

export interface JobContext {
  description?: string;
  contractNames?: string[];
  templateId?: string;
  templateParams?: Record<string, string>;
  targetPath?: string;
  upgradeStrategy?: "uups" | "transparent" | "beacon";
  governorApprovalRef?: string;
  searchQuery?: string;
}

export interface TouchedFile {
  path: string;
  sha256Before?: string;
  sha256After?: string;
  action: "created" | "modified" | "deleted" | "read";
}

export interface JobEvidence {
  jobId: string;
  generatedAt: string;
  toolVersions: Record<string, string>;
  touchedFiles: TouchedFile[];
  patchDiff?: string;
  compileLogs?: string;
  testLogs?: string;
  auditLogs?: string;
  sha256Manifest: string;
  signature?: string;
}

export interface JobResult {
  success: boolean;
  summary: string;
  buildPassed?: boolean;
  testPassed?: boolean;
  slitherHighFindings?: number;
  riskScore?: number;
  patchDiff?: string;
  evidence?: JobEvidence;
  artifacts?: Record<string, string>;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  targetPaths: string[];
  constraints: JobConstraints;
  context: JobContext;
  initiator: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: JobResult;
  error?: string;
}

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
