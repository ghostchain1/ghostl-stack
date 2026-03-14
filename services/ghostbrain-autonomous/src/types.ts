/**
 * GhostBrain Autonomous — Shared Proposal Types
 *
 * A Proposal is the unit of output from every monitor and action.
 * It is never auto-executed.  The engine forwards proposals to the
 * signing relay (port 7910) where a human operator must Approve them.
 *
 * Shape mirrors KernelCommand so the signing relay can validate and
 * route proposals directly to the appropriate handler when ratified.
 */

export type ProposalSeverity = "info" | "warning" | "critical";
export type ProposalStatus   = "pending" | "sent" | "dry_run" | "send_failed";

export type ProposalType =
  | "restart_validator"
  | "rebalance_validators"
  | "scale_infrastructure"
  | "treasury_strategy"
  | "alert_chain_stale"
  | "alert_container_down"
  | "alert_liquidity_imbalance"
  | "alert_validator_jailed";

export interface Proposal {
  /** Unique ID for deduplication and UI tracking. */
  id:         string;
  type:       ProposalType;
  /** Mirrors KernelCommand.type for relay routing. */
  kernelType: "docker" | "vm" | "system" | "resource" | "alert";
  /** Mirrors KernelCommand.action. */
  action:     string;
  /** Human-readable label for the target resource (validator name, chain, etc.). */
  target:     string;
  severity:   ProposalSeverity;
  /** One-line summary shown in the UI. */
  reason:     string;
  /** Structured payload forwarded verbatim to the signing relay. */
  payload:    Record<string, unknown>;
  createdAt:  string;   // ISO timestamp
  status:     ProposalStatus;
  /** Source module that generated this proposal. */
  source:     string;
}
