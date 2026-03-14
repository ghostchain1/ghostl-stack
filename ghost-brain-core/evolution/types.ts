/**
 * GhostBrain Self-Evolution Engine — Shared Types
 *
 * All evolution documents are typed, versioned, and immutable after creation.
 * The engine NEVER writes to source directories. All changes live in the
 * isolated staging dir until a human ratifies them via governance.
 *
 * Lifecycle of an evolution proposal:
 *   1. EvolutionTask      — a specific improvement identified by the planner
 *   2. EvolutionDiff      — a structured patch produced by the generator
 *   3. StagingResult      — outcome of copying + applying the diff in staging
 *   4. TestReport         — result of running the test suite against staging
 *   5. AuditReport        — result of security + stability verification
 *   6. EvolutionProposal  — the complete signed proposal submitted to the relay
 *   7. ProposalStatus     — polling result from the governance gate
 */

import type { EventCategory } from "../memory/models/system_event.js";

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type EvolutionTaskKind =
  | "improve_container_recovery"   // Better restart logic for Docker containers
  | "improve_vm_recovery"          // Better restart logic for VMs
  | "tune_detection_threshold"     // Adjust anomaly/pattern thresholds
  | "add_memory_category"          // Add a new event category to the memory model
  | "improve_network_routing"      // Update NetworkController routing config
  | "update_load_balance_weights"  // Tune ResourceOptimizer weights
  | "refine_risk_scoring"          // Update SecurityAI confidence formula
  | "add_swarm_agent";             // Propose a new Swarm agent skeleton

export interface EvolutionTask {
  id:          string;        // UUID
  kind:        EvolutionTaskKind;
  /** Memory categories that triggered this task. */
  triggers:    EventCategory[];
  /** How many times the triggering pattern was observed. */
  frequency:   number;
  priority:    number;        // 0–100; higher = more urgent
  description: string;
  createdAt:   number;        // Unix ms
}

// ---------------------------------------------------------------------------
// Diffs
// ---------------------------------------------------------------------------

/**
 * A structured representation of a proposed change.
 * Contains a unified diff string, not executable code.
 * The diff targets a relative path inside the ghost-brain-core source tree.
 * It is NEVER applied autonomously — humans must apply it after ratification.
 */
export interface EvolutionDiff {
  taskId:           string;
  /** The task kind that produced this diff — preserved for relay metadata. */
  kind:             EvolutionTaskKind;
  /** Relative path from ghost-brain-core/ root (e.g. "supervisor/brain/decision_engine.ts"). */
  targetFile:       string;
  /** Unified diff format (--- a/file, +++ b/file, @@ hunks). */
  unifiedDiff:      string;
  /** Human-readable explanation of the change. */
  rationale:        string;
  /** SHA-256 digest of the unifiedDiff content for integrity checking. */
  diffHash:         string;
  generatedAt:      number;
}

// ---------------------------------------------------------------------------
// Staging
// --------------------------------------------------------------------------->

export interface StagingResult {
  taskId:          string;
  stagingPath:     string;   // absolute path in /tmp/ghostbrain-evolution/
  success:         boolean;
  error?:          string;
  stagedAt:        number;
}

// ---------------------------------------------------------------------------
// Test report
// ---------------------------------------------------------------------------

export interface TestReport {
  taskId:          string;
  /** Absolute path of the sandboxed copy used for the test run. */
  sandboxedDir:    string;
  /** Legacy alias kept for compatibility with callers using stagingPath. */
  stagingPath?:    string;
  passed:          boolean;
  exitCode:        number;
  stdout:          string;
  stderr:          string;
  durationMs:      number;
  ranAt:           number;
}

// ---------------------------------------------------------------------------
// Sandbox result
// ---------------------------------------------------------------------------

export interface SandboxResult {
  taskId:        string;
  sandboxDir:    string;
  patchApplied:  boolean;
  testReport:    TestReport;
  error?:        string;
  ranAt:         number;
}

// ---------------------------------------------------------------------------
// Audit report
// ---------------------------------------------------------------------------

export interface AuditFinding {
  severity:  "block" | "warn";
  pattern:   string;
  message:   string;
  line?:     number;
}

export interface AuditReport {
  taskId:      string;
  approved:    boolean;        // false if any "block" severity finding exists
  findings:    AuditFinding[];
  auditedAt:   number;
}

export interface StabilityReport {
  taskId:      string;
  stable:      boolean;
  cpuPct:      number;
  memPct:      number;
  reason?:     string;
  checkedAt:   number;
}

// ---------------------------------------------------------------------------
// Proposal (submitted to signing relay)
// ---------------------------------------------------------------------------

export type ProposalStatus =
  | "pending_ratification"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired";

export interface EvolutionProposal {
  id:            string;           // UUID
  taskId:        string;
  kind:          EvolutionTaskKind;
  targetFile:    string;
  unifiedDiff:   string;
  diffHash:      string;
  rationale:     string;
  testPassed:    boolean;
  auditApproved: boolean;
  systemStable:  boolean;
  /** GhostChain governance constants. */
  chain_id:      14000101;
  gas_token:     "GST";
  from:          "ghostbrain-evolution";
  submittedAt:   number;
}

export interface ProposalReceipt {
  relayPendingId: string;
  status:         ProposalStatus;
  submittedAt:    number;
  error?:         string;
}

// ---------------------------------------------------------------------------
// Rollback result
// ---------------------------------------------------------------------------

export interface RollbackResult {
  taskId:          string;
  stagingCleaned:  boolean;
  relayNotified:   boolean;
  error?:          string;
  rolledBackAt:    number;
}
