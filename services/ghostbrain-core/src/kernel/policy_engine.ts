/**
 * GhostBrain Kernel — Policy Engine
 *
 * Defines the governance policy layer that sits above the Infrastructure
 * Simulator.  The simulator answers "will this action be safe?".  The
 * policy engine answers "is the AI permitted to make this class of decision
 * autonomously?".
 *
 * Two orthogonal concerns are addressed:
 *
 *   1. Action classification — maps a (SimActionType, target) pair to a
 *      permission level:
 *        autonomous            — AI may execute without simulation gate
 *        simulate_first        — must pass sim verdict "approve"
 *        require_ratification  — always needs human quorum vote
 *        forbidden             — never executed by AI
 *
 *   2. Rate governance — ensures the AI cannot take more than N actions in
 *      a sliding window to prevent runaway self-healing loops.
 *
 * Policy configuration is read from env vars so it can be adjusted per
 * environment (devnet vs mainnet) without code changes.
 *
 * Chain routing law: policies for L1 are strictly more conservative than
 * L2 or L3 to preserve settlement integrity.
 */

import type { SimActionType, SimActionRequester } from "../simulator/sim_model.js";
import { inc, set } from "../observability/metrics_exporter.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PolicyPermission =
  | "autonomous"           // AI may act without further checks
  | "simulate_first"       // sim verdict must be "approve"
  | "require_ratification" // always blocked pending human vote
  | "forbidden";           // hard block — never executed

export interface PolicyRule {
  actionType:  SimActionType;
  /** Optional glob-style target pattern match (e.g. "ghostchain*" → l1) */
  targetMatch?: RegExp;
  permission:  PolicyPermission;
  reason:      string;
}

export interface PolicyDecision {
  permission:  PolicyPermission;
  matchedRule: PolicyRule | null;
  reason:      string;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

const RATE_WINDOW_MS     = Number(process.env.POLICY_RATE_WINDOW_MS    ?? "300000");  // 5 min
const RATE_MAX_ACTIONS   = Number(process.env.POLICY_RATE_MAX_ACTIONS  ?? "10");

const _actionTimestamps: number[] = [];
let _rateLimitedCount = 0;

function isRateLimited(): boolean {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  // Prune old entries
  while (_actionTimestamps.length > 0 && _actionTimestamps[0]! < cutoff) {
    _actionTimestamps.shift();
  }
  return _actionTimestamps.length >= RATE_MAX_ACTIONS;
}

/** Call this when an action is actually executed (not just evaluated). */
export function recordActionExecuted(): void {
  _actionTimestamps.push(Date.now());
}

// ── Policy table ──────────────────────────────────────────────────────────────
//
// Rules are evaluated top-to-bottom; first match wins.
// Target patterns match against the lowercase container/VM name.
//
// L1 rules come first (most restrictive).

const POLICY_RULES: PolicyRule[] = [
  // ── Absolute bans ───────────────────────────────────────────────────────
  {
    actionType: "evict_container",
    targetMatch: /ghostchain|ghost-l1|ghostl1/i,
    permission: "forbidden",
    reason:     "Evicting L1 chain node is forbidden — requires emergency governance vote.",
  },
  {
    actionType: "evict_container",
    permission: "require_ratification",
    reason:     "Evicting any container requires governance ratification.",
  },

  // ── L1 — ultra conservative ─────────────────────────────────────────────
  {
    actionType: "restart_container",
    targetMatch: /ghostchain|ghost-l1|ghostl1/i,
    permission: "require_ratification",
    reason:     "Restarting L1 chain node requires governance ratification.",
  },
  {
    actionType: "throttle_container_mem",
    targetMatch: /ghostchain|ghost-l1|ghostl1/i,
    permission: "require_ratification",
    reason:     "Memory throttle on L1 chain node requires governance ratification.",
  },
  {
    actionType: "throttle_container_cpu",
    targetMatch: /ghostchain|ghost-l1|ghostl1/i,
    permission: "require_ratification",
    reason:     "CPU throttle on L1 chain node requires governance ratification.",
  },
  {
    actionType: "migrate_workload",
    targetMatch: /ghostchain|ghost-l1|ghostl1/i,
    permission: "forbidden",
    reason:     "L1 chain node migration is forbidden.",
  },

  // ── L2 — conservative ──────────────────────────────────────────────────
  {
    actionType: "restart_container",
    targetMatch: /ghostl2|ghost-l2/i,
    permission: "simulate_first",
    reason:     "L2 chain node restart requires simulation approval.",
  },
  {
    actionType: "throttle_container_mem",
    targetMatch: /ghostl2|ghost-l2/i,
    permission: "simulate_first",
    reason:     "L2 chain node memory throttle requires simulation approval.",
  },
  {
    actionType: "throttle_container_cpu",
    targetMatch: /ghostl2|ghost-l2/i,
    permission: "simulate_first",
    reason:     "L2 chain node CPU throttle requires simulation approval.",
  },

  // ── L3 — moderate ────────────────────────────────────────────────────────
  {
    actionType: "restart_container",
    targetMatch: /ghostl3|ghost-l3/i,
    permission: "simulate_first",
    reason:     "L3 chain node restart requires simulation approval.",
  },

  // ── Ghost AI / Brain services — simulate first ───────────────────────────
  {
    actionType: "restart_container",
    targetMatch: /ghostbrain|ghost-ai/i,
    permission: "simulate_first",
    reason:     "Restarting GhostBrain services requires simulation.",
  },

  // ── Migrate — always simulate ────────────────────────────────────────────
  {
    actionType: "migrate_workload",
    permission: "simulate_first",
    reason:     "Workload migration is high-risk and always requires simulation.",
  },

  // ── Memory/CPU throttle on generic containers — simulate ─────────────────
  {
    actionType: "throttle_container_mem",
    permission: "simulate_first",
    reason:     "Memory throttle on unknown container requires simulation.",
  },
  {
    actionType: "throttle_container_cpu",
    permission: "simulate_first",
    reason:     "CPU throttle on unknown container requires simulation.",
  },

  // ── Restart of generic non-chain containers — simulate ───────────────────
  {
    actionType: "restart_container",
    permission: "simulate_first",
    reason:     "Container restart requires simulation approval.",
  },

  // ── Low-risk actions — autonomous ─────────────────────────────────────────
  { actionType: "unthrottle_container", permission: "autonomous",    reason: "Removing throttle is low-risk." },
  { actionType: "flush_cache",          permission: "autonomous",    reason: "Cache flush is non-destructive." },
  { actionType: "noop",                 permission: "autonomous",    reason: "No-op is always safe." },

  // ── VM memory — simulate ───────────────────────────────────────────────────
  { actionType: "adjust_vm_memory",     permission: "simulate_first", reason: "VM memory adjustment requires simulation." },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate policy for a proposed action and target.
 * Returns the permission level and the matched rule for audit logging.
 */
export function evaluatePolicy(
  actionType: SimActionType,
  targetId:   string,
  _requestedBy?: SimActionRequester,
): PolicyDecision {
  // Rate limit check — applies to all non-forbidden actions
  if (actionType !== "noop" && isRateLimited()) {
    _rateLimitedCount++;
    inc("ghostbrain_policy_decision_total", "Policy decisions by permission level", 1, { permission: "rate_limited" });
    set("ghostbrain_policy_window_actions", "Actions in current rate-limit window", _actionTimestamps.length);
    return {
      permission: "require_ratification",
      matchedRule: null,
      reason:      `AI action rate limit reached (${RATE_MAX_ACTIONS} actions in ${RATE_WINDOW_MS / 60000} min). Human ratification required.`,
    };
  }

  // Find first matching rule
  for (const rule of POLICY_RULES) {
    if (rule.actionType !== actionType) continue;
    if (rule.targetMatch && !rule.targetMatch.test(targetId)) continue;
    inc("ghostbrain_policy_decision_total", "Policy decisions by permission level", 1, { permission: rule.permission });
    set("ghostbrain_policy_window_actions", "Actions in current rate-limit window", _actionTimestamps.length);
    return { permission: rule.permission, matchedRule: rule, reason: rule.reason };
  }

  // Default: require simulation (fail-safe default)
  inc("ghostbrain_policy_decision_total", "Policy decisions by permission level", 1, { permission: "simulate_first" });
  set("ghostbrain_policy_window_actions", "Actions in current rate-limit window", _actionTimestamps.length);
  return {
    permission:  "simulate_first",
    matchedRule: null,
    reason:      "No policy rule matched — defaulting to simulate_first.",
  };
}

/**
 * Returns true if an action is allowed to proceed under the given permission
 * level and sim verdict.  Encapsulates the policy → sim → execute decision.
 *
 * @param permission  - result of evaluatePolicy()
 * @param simVerdict  - result of sim evaluation ("approve" | "block" | "require_ratification")
 */
export function isActionPermitted(
  permission:  PolicyPermission,
  simVerdict?: "approve" | "block" | "require_ratification",
): boolean {
  if (permission === "forbidden" || permission === "require_ratification") return false;
  if (permission === "autonomous") return true;
  // simulate_first: sim must approve
  return simVerdict === "approve";
}

export function policyStats() {
  return {
    ruleCount:          POLICY_RULES.length,
    rateWindow:         { windowMs: RATE_WINDOW_MS, maxActions: RATE_MAX_ACTIONS },
    rateLimitedCount:   _rateLimitedCount,
    recentActionCount:  _actionTimestamps.length,
  };
}

export function getPolicyRules(): PolicyRule[] {
  return POLICY_RULES.map(r => ({
    ...r,
    targetMatch: r.targetMatch?.source, // serialize regex for JSON
  })) as unknown as PolicyRule[];
}
