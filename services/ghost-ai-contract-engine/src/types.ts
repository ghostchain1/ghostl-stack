// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — canonical types

// ─── Severity ────────────────────────────────────────────────────────────────

export type ErrorSeverity = "info" | "low" | "medium" | "high" | "critical";

export type ErrorCategory =
  | "compile_error"
  | "parser_error"
  | "import_missing"
  | "type_mismatch"
  | "stack_too_deep"
  | "reentrancy"
  | "access_control"
  | "arithmetic"
  | "uninitialized_storage"
  | "routing_law_violation"
  | "spdx_missing"
  | "branding_missing"
  | "invalid_hex_literal"
  | "interface_inside_contract"
  | "member_not_found"
  | "other";

// ─── Scan result (from scanner.ts) ───────────────────────────────────────────

export interface SolError {
  filePath:     string;       // absolute path
  line:         number;       // 1-based
  col:          number;       // 1-based
  severity:     ErrorSeverity;
  category:     ErrorCategory;
  message:      string;
  raw:          string;       // raw solc output line
  fingerprint:  string;       // sha256(filePath:line:message) hex
}

export interface ScanResult {
  scannedAt:    string;       // ISO-8601
  durationMs:   number;
  filesScanned: number;
  errorCount:   number;
  warningCount: number;
  errors:       SolError[];
  warnings:     SolError[];
}

// ─── Fix result (from fixer.ts) ──────────────────────────────────────────────

export type FixStatus = "applied" | "skipped" | "failed";

export interface FixResult {
  error:        SolError;
  status:       FixStatus;
  description:  string;
  diff:         string;       // unified diff (empty if skipped/failed)
  confidenceBps: number;      // 0–10 000
}

// ─── Brand result (from brander.ts) ──────────────────────────────────────────

export interface BrandResult {
  filePath:  string;
  branded:   boolean;
  skipped:   boolean;         // bridge contract or already branded
  reason:    string;
}

// ─── Compile result (from compiler.ts) ───────────────────────────────────────

export type CompileStatus = "pass" | "fail" | "oom" | "timeout";

export interface CompileResult {
  startedAt:     string;
  finishedAt:    string;
  durationMs:    number;
  status:        CompileStatus;
  filesCompiled: number;
  errorCount:    number;
  warningCount:  number;
  stdout:        string;
  stderr:        string;
  /// keccak256 placeholder (computed by engine from artifact hashes)
  aggregateBytecodeHash: string;
}

// ─── Engine cycle (full scan+fix+compile pass) ────────────────────────────────

export interface EngineCycle {
  cycleId:    string;
  startedAt:  string;
  scan:       ScanResult;
  fixes:      FixResult[];
  brands:     BrandResult[];
  compile:    CompileResult;
  finishedAt: string;
}

// ─── NATS events published to ghostbrain-core ────────────────────────────────

export interface GhostBrainContractEvent {
  source:    "ghost-ai-contract-engine";
  event:     "cycle.complete" | "error.found" | "fix.applied" | "compile.pass" | "compile.fail";
  cycleId:   string;
  payload:   unknown;
  timestamp: string;
}
