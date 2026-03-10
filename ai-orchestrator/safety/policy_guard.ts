/**
 * GhostStack Global AI Orchestrator — Policy Guard
 *
 * The safety gate for every orchestrated action.  All tasks MUST pass through
 * PolicyGuard.check() before being dispatched to an agent.
 *
 * Policy layers (evaluated in order):
 *
 *   1. Hard denials — NEVER permitted autonomously:
 *        - On-chain governance execution (requires human multi-sig ratification)
 *        - Validator slashing or ejection
 *        - Emergency halt of any layer
 *        - Direct chain parameter modification
 *
 *   2. Human-approval required — task is held pending human sign-off:
 *        - Any CRITICAL-priority task
 *        - SECURITY task type
 *        - Bridge configuration changes
 *        - Treasury disbursements flagged in payload
 *
 *   3. Rate limiting — protects against runaway AI task generation:
 *        - Max MAX_TASKS_PER_WINDOW tasks per type per RATE_WINDOW_MS
 *        - Excess tasks are DENY'd until the window resets
 *
 * All DENY / REQUIRE_HUMAN_APPROVAL decisions are replicated to GhostBrain
 * Sentinel at /safety/policy-denial for cross-system audit.
 *
 * Chain: GhostChain L1 (chain_id 14000101). Gas token: GST.
 */

import type { Task } from "../core/task_router.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101 as const;

/** Maximum tasks of a single type per rate window. */
const MAX_TASKS_PER_WINDOW = 50;

/** Rate window duration (5 minutes). */
const RATE_WINDOW_MS = 5 * 60 * 1_000;

/** Bounded audit log size. */
const MAX_AUDIT_LOG = 2_000;

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_HUMAN_APPROVAL";

export interface PolicyResult {
  decision:    PolicyDecision;
  reason:      string;
  policyId:    string;
  evaluatedAt: number;  // Unix seconds
}

export interface PolicyAuditEntry {
  taskId:    string;
  taskType:  string;
  decision:  PolicyDecision;
  policyId:  string;
  reason:    string;
  timestamp: number;
  chain_id:  number;
  gas_token: string;
}

export interface PolicyGuardOptions {
  ghostbrainUrl?: string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── Rate bucket ───────────────────────────────────────────────────────────────

interface RateBucket {
  count:       number;
  windowStart: number;  // Unix ms
}

// ── PolicyGuard ───────────────────────────────────────────────────────────────

export class PolicyGuard {
  private readonly ghostbrainUrl: string;
  private readonly fetcher:       (url: string, init?: RequestInit) => Promise<Response>;

  private readonly auditLog:    PolicyAuditEntry[] = [];
  private readonly rateBuckets  = new Map<string, RateBucket>();

  constructor(opts: PolicyGuardOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.fetcher       = opts.fetcher       ?? ((u, i) => fetch(u, i));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Evaluate a task against all policy layers. Returns a PolicyResult. */
  check(task: Task): PolicyResult {
    const hard = this._hardDenial(task);
    if (hard !== null) return this._emit(task, "DENY", hard, "HARD-DENY");

    const human = this._requiresHuman(task);
    if (human !== null) return this._emit(task, "REQUIRE_HUMAN_APPROVAL", human, "HUMAN-APPROVAL");

    const rate = this._rateCheck(task);
    if (rate !== null) return this._emit(task, "DENY", rate, "RATE-LIMIT");

    return this._emit(task, "ALLOW", "All policy checks passed", "ALLOW");
  }

  /** Recent non-ALLOW decisions, newest first. */
  recentDenials(limit = 50): PolicyAuditEntry[] {
    const result: PolicyAuditEntry[] = [];
    for (let i = this.auditLog.length - 1; i >= 0 && result.length < limit; i--) {
      if (this.auditLog[i]!.decision !== "ALLOW") result.push(this.auditLog[i]!);
    }
    return result;
  }

  /** Full audit log (newest first). */
  recentLog(limit = 50): PolicyAuditEntry[] {
    return this.auditLog.slice(-limit).reverse();
  }

  // ── Layer 1: Hard denials ──────────────────────────────────────────────────

  private _hardDenial(task: Task): string | null {
    const action = task.payload["action"];

    if (task.type === "GOVERNANCE" && action === "execute_proposal")
      return "On-chain governance execution requires human multi-sig ratification";

    if (task.type === "VALIDATOR" && (action === "slash" || action === "eject"))
      return "Validator slashing/ejection requires human approval";

    if (action === "emergency_halt" || action === "halt")
      return "Emergency halt requires human authorization";

    if (action === "set_chain_param" || action === "modify_gas_limit")
      return "Chain parameter modification requires a governance vote";

    return null;
  }

  // ── Layer 2: Human-approval required ──────────────────────────────────────

  private _requiresHuman(task: Task): string | null {
    if (task.priority === "CRITICAL")
      return "CRITICAL-priority tasks require human review before execution";

    if (task.type === "SECURITY")
      return "Security tasks require human review";

    if (task.type === "BRIDGE" && task.payload["action"] === "update_bridge_config")
      return "Bridge configuration changes require human approval";

    if (task.payload["treasury_disbursement"] === true)
      return "Treasury disbursements require GhostChainGovernor approval";

    return null;
  }

  // ── Layer 3: Rate limiting ─────────────────────────────────────────────────

  private _rateCheck(task: Task): string | null {
    const now    = Date.now();
    const bucket = this.rateBuckets.get(task.type);

    if (bucket === undefined || (now - bucket.windowStart) > RATE_WINDOW_MS) {
      this.rateBuckets.set(task.type, { count: 1, windowStart: now });
      return null;
    }

    bucket.count += 1;
    if (bucket.count > MAX_TASKS_PER_WINDOW)
      return `Rate limit exceeded for ${task.type}: ${bucket.count}/${MAX_TASKS_PER_WINDOW} in 5-min window`;

    return null;
  }

  // ── Emit + audit ───────────────────────────────────────────────────────────

  private _emit(
    task:     Task,
    decision: PolicyDecision,
    reason:   string,
    policyId: string,
  ): PolicyResult {
    const entry: PolicyAuditEntry = {
      taskId:    task.id,
      taskType:  task.type,
      decision,
      policyId,
      reason,
      timestamp: nowSec(),
      chain_id:  L1_CHAIN_ID,
      gas_token: "GST",
    };

    this.auditLog.push(entry);
    if (this.auditLog.length > MAX_AUDIT_LOG) this.auditLog.shift();

    if (decision !== "ALLOW") void this._reportToGhostBrain(entry);

    return { decision, reason, policyId, evaluatedAt: entry.timestamp };
  }

  private async _reportToGhostBrain(entry: PolicyAuditEntry): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/safety/policy-denial`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(entry),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[PolicyGuard] GhostBrain report failed:", err.message);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
