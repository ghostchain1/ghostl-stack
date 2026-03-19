/**
 * GhostBrain Kernel — Safety Guard
 *
 * Every KernelCommand must pass SafetyGuard.validate() before the
 * CommandBus dispatches it to a handler.  The guard enforces:
 *
 *   1. Target format validation — alphanumeric + limited punctuation, max 128 chars
 *   2. Action allowlist — explicit per-type permitted action set
 *   3. Protected target patterns — L1, GhostBrain control plane, data layer,
 *      and Ghost runtime processes: never mutable
 *   4. Target allowlist — opt-in env-configured set of mutable resources
 *   5. Per-target sliding-window rate limiter (circuit breaker)
 *
 * All rejections are logged so they appear in the kernel audit trail.
 *
 * Env vars:
 *   KERNEL_DRY_RUN=1              — report-only mode (no writes through bus)
 *   KERNEL_RATE_WINDOW_MS=60000   — sliding window width (default 60 s)
 *   KERNEL_RATE_MAX=5             — max actions per target per window
 *   KERNEL_TARGET_ALLOWLIST=a,b   — comma-separated allowlisted target names;
 *                                   when non-empty, unlisted targets are blocked
 */

import type { KernelCommand } from "./kernel_types.js";
import { log } from "../observability/event_logger.js";

// ── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN_MODE     = process.env.KERNEL_DRY_RUN === "1";
const RATE_WINDOW_MS   = Number(process.env.KERNEL_RATE_WINDOW_MS ?? "60000");
const RATE_MAX_ACTIONS = Number(process.env.KERNEL_RATE_MAX       ?? "5");

// Target names: letters, digits, hyphens, underscores, dots — max 128 chars.
// This prevents path-traversal and shell meta-character injection.
const TARGET_RE = /^[a-zA-Z0-9_\-\.]{1,128}$/;

// Actions permitted per command type.  Anything not in this list is blocked
// regardless of what a caller supplies.
const ALLOWED_ACTIONS: Readonly<Record<KernelCommand["type"], readonly string[]>> = {
  docker:   ["restart", "stop", "start", "kill", "pause", "unpause"],
  vm:       ["start", "stop", "reboot", "suspend", "resume"],
  system:   ["drop_caches", "gc", "check_disk"],
  resource: ["rebalance", "set_cpu_quota", "set_mem_quota"],
};

// These targets are absolutely protected — L1 chain, signing relay, GhostBrain
// control plane, data layer, and the Ghost-native rollup runtime. No autonomous
// action may target them. Escalation goes to the signing relay for human
// ratification.
const GHOST_PROTECTED_PATTERNS: readonly RegExp[] = [
  /ghostchain|ghost[-_]?l1|ghostchaind|ghostchain-evm|ghostchain-l1/i,
  /signing[-_]relay|^ghostbrain(?:[-_].*)?$|^hyper-ghost-ai$|^hypervisor-supervisor$/i,
  /\bpostgres\b|\bredis\b|\bqdrant\b/i,
  /^(?:ghost[_-])?(?:ghost-exec|ghost-sequencer|ghost-deriver|ghost-settlement|ghost-bridge|ghost-proof|ghost-observability|ghost-rollup-proxy|ghost-rpc-proxy|ghostl2|ghostl3)(?:[-_].*)?$/i,
];

const PROTECTED_PATTERNS: readonly RegExp[] = [...GHOST_PROTECTED_PATTERNS];

// Optional allowlist: comma-separated container / VM names.
// When KERNEL_TARGET_ALLOWLIST is non-empty, any target NOT in the list
// is blocked automatically.
const _rawAllowlist = process.env.KERNEL_TARGET_ALLOWLIST ?? "";
const TARGET_ALLOWLIST = new Set<string>(
  _rawAllowlist
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
);
const ALLOWLIST_ENABLED = TARGET_ALLOWLIST.size > 0;

// ── Rate limiter ─────────────────────────────────────────────────────────────

const _rateBuckets = new Map<string, number[]>();  // target → timestamps
let   _rateLimitedTotal = 0;

function rateLimitCheck(target: string): boolean {
  const now    = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hist   = (_rateBuckets.get(target) ?? []).filter(t => t >= cutoff);
  if (hist.length >= RATE_MAX_ACTIONS) {
    _rateLimitedTotal++;
    return false;   // circuit breaker tripped
  }
  hist.push(now);
  _rateBuckets.set(target, hist);
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SafetyResult {
  ok:     boolean;
  reason: string;
}

/**
 * Validate a KernelCommand.
 * Returns { ok: true } when the command may proceed; { ok: false, reason }
 * when it must be blocked.
 */
export function validate(cmd: KernelCommand): SafetyResult {
  // 1. Dry-run gate — in dry_run mode the bus itself marks commands dryRun=true,
  //    so commands that arrive without dryRun=true when mode is active are blocked.
  if (DRY_RUN_MODE && !cmd.dryRun) {
    return { ok: false, reason: "KERNEL_DRY_RUN=1: write-mode commands blocked; set dryRun=true" };
  }

  // 2. Target format check — reject anything that could escape an API path
  const target = cmd.target ?? "";
  if (target && !TARGET_RE.test(target)) {
    log.warn("safety_guard: invalid_target", `target="${target}" action=${cmd.action}`);
    return { ok: false, reason: `target contains disallowed characters: "${target}"` };
  }

  // 3. Protected target check
  for (const rx of PROTECTED_PATTERNS) {
    if (target && rx.test(target)) {
      log.warn("safety_guard: protected_target", `target="${target}" action=${cmd.action}`);
      return {
        ok: false,
        reason: `target "${target}" is protected and requires governance ratification`,
      };
    }
  }

  // 4. Allowlist check (optional — only enforced when KERNEL_TARGET_ALLOWLIST is set)
  if (ALLOWLIST_ENABLED && target && !TARGET_ALLOWLIST.has(target.toLowerCase())) {
    log.warn("safety_guard: not_allowlisted", `target="${target}"`);
    return { ok: false, reason: `target "${target}" is not in KERNEL_TARGET_ALLOWLIST` };
  }

  // 5. Action allowlist check
  const allowed = ALLOWED_ACTIONS[cmd.type];
  if (!allowed || !(allowed as readonly string[]).includes(cmd.action)) {
    log.warn("safety_guard: action_blocked", `type=${cmd.type} action=${cmd.action}`);
    return { ok: false, reason: `action "${cmd.type}:${cmd.action}" is not in the permitted set` };
  }

  // 6. Per-target rate limiter (skipped when no specific target)
  if (target && !rateLimitCheck(target)) {
    log.warn("safety_guard: rate_limited", `target="${target}" action=${cmd.action}`);
    return { ok: false, reason: `rate limit exceeded for target "${target}" (${RATE_MAX_ACTIONS} per ${RATE_WINDOW_MS / 1000}s)` };
  }

  return { ok: true, reason: "approved" };
}

export function safetyGuardStats(): {
  dryRunMode:       boolean;
  allowlistEnabled: boolean;
  allowlistSize:    number;
  rateLimitedTotal: number;
  activeBuckets:    number;
} {
  return {
    dryRunMode:       DRY_RUN_MODE,
    allowlistEnabled: ALLOWLIST_ENABLED,
    allowlistSize:    TARGET_ALLOWLIST.size,
    rateLimitedTotal: _rateLimitedTotal,
    activeBuckets:    _rateBuckets.size,
  };
}
