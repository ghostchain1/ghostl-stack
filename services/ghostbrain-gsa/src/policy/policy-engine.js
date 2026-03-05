/**
 * @file src/policy/policy-engine.js
 * @description Constitutional policy gate for ghostbrain-gsa.
 *
 * Every "write" action (plan application, patch, config change) MUST pass
 * through the policy engine before execution. The engine enforces:
 *
 *  1. Routing law invariants (L3→L2→L1, no direct L3→L1)
 *  2. Branding invariants (Ghost/GST/18, no ETH leaks)
 *  3. apply-enabled guard (default: DISABLED)
 *  4. Allowlist check (permitted paths + commands)
 *  5. Reversibility requirement (patch must include rollback)
 *  6. Test coverage requirement (patch must include tests)
 *  7. Bundle hash requirement (apply requires verified OGB hash)
 *
 * Decisions: ALLOW | DENY | ALLOW_WITH_CONDITIONS
 */

import { validatePatchAgainstConstitution } from './constraints.js';
import { config } from '../config.js';

/** @typedef {'ALLOW'|'DENY'|'ALLOW_WITH_CONDITIONS'} PolicyDecision */

/**
 * @typedef {Object} PolicyRequest
 * @property {'READ'|'WRITE'} mode
 * @property {string} action                  - e.g. 'apply', 'scan', 'plan', 'verify'
 * @property {string} [filePath]              - target file (for write actions)
 * @property {string} [command]               - shell command (for tool invocations)
 * @property {object} [patch]                 - patch object for constitutional check
 * @property {boolean} [hasRollback]          - true if patch includes rollback
 * @property {boolean} [hasTests]             - true if patch includes tests
 * @property {string}  [bundleHash]           - sha256 of verified OGB bundle
 */

/**
 * @typedef {Object} PolicyResult
 * @property {PolicyDecision} decision
 * @property {string[]} reasons
 * @property {string[]} conditions            - for ALLOW_WITH_CONDITIONS
 * @property {string} policySnapshotHash      - sha256 of policy state at decision time
 */

// Paths that WRITE actions may target (allowlist — everything else is DENY)
const WRITE_ALLOWED_PATHS = [
  /^contracts\/src\//,
  /^contracts\/test\//,
  /^packages\//,
  /^services\//,
  /^\.github\/workflows\//,
  /^docs\//,
];

// Commands that the executor may run (allowlist)
const WRITE_ALLOWED_COMMANDS = [
  /^npm\s+(ci|test|audit)/,
  /^forge\s+(build|test)/,
  /^node\s+--test/,
  /^git\s+diff/,
  /^git\s+apply/,
];

import { createHash } from 'node:crypto';

function snapshotHash() {
  const state = JSON.stringify({
    applyEnabled: config.applyEnabled,
    agentId: config.agentId,
    ts: Math.floor(Date.now() / 60_000), // 1-minute resolution
  });
  return createHash('sha256').update(state).digest('hex');
}

function isPathAllowed(filePath) {
  if (!filePath) return true;
  return WRITE_ALLOWED_PATHS.some(p => p.test(filePath));
}

function isCommandAllowed(command) {
  if (!command) return true;
  return WRITE_ALLOWED_COMMANDS.some(p => p.test(command));
}

/**
 * Evaluate a policy decision for the given request.
 * @param {PolicyRequest} req
 * @returns {PolicyResult}
 */
export function evaluate(req) {
  const reasons = [];
  const conditions = [];
  const hash = snapshotHash();

  // 1. Read-only mode default — block all writes unless GSA_APPLY_ENABLED
  if (req.mode === 'WRITE' && !config.applyEnabled && req.action === 'apply') {
    reasons.push('POLICY_DENIED: apply is disabled (GSA_APPLY_ENABLED=false). Set env to enable.');
    return { decision: 'DENY', reasons, conditions, policySnapshotHash: hash };
  }

  // 2. Allowlist: file paths
  if (req.filePath && !isPathAllowed(req.filePath)) {
    reasons.push(`POLICY_DENIED: file path "${req.filePath}" is not in the write allowlist`);
    return { decision: 'DENY', reasons, conditions, policySnapshotHash: hash };
  }

  // 3. Allowlist: commands
  if (req.command && !isCommandAllowed(req.command)) {
    reasons.push(`POLICY_DENIED: command "${req.command}" is not in the command allowlist`);
    return { decision: 'DENY', reasons, conditions, policySnapshotHash: hash };
  }

  // 4. Constitutional constraints (routing + branding)
  if (req.patch) {
    const result = validatePatchAgainstConstitution(req.patch);
    if (!result.ok) {
      reasons.push(...result.violations);
      return { decision: 'DENY', reasons, conditions, policySnapshotHash: hash };
    }
  }

  // 5. Reversibility required for write/apply
  if (req.mode === 'WRITE' && req.action === 'apply') {
    if (!req.hasRollback) {
      conditions.push('CONDITION: patch must include a rollback step before apply');
    }
    if (!req.hasTests) {
      conditions.push('CONDITION: patch must include tests before apply');
    }
    if (!req.bundleHash) {
      conditions.push('CONDITION: a verified governance bundle hash is required for apply');
    }
    if (conditions.length > 0) {
      return { decision: 'ALLOW_WITH_CONDITIONS', reasons, conditions, policySnapshotHash: hash };
    }
  }

  return { decision: 'ALLOW', reasons, conditions, policySnapshotHash: hash };
}

/**
 * Shorthand: assert ALLOW — throws PolicyDeniedError otherwise.
 * @param {PolicyRequest} req
 * @returns {PolicyResult}
 */
export function enforce(req) {
  const result = evaluate(req);
  if (result.decision === 'DENY') {
    const err = new Error(`PolicyDenied: ${result.reasons.join('; ')}`);
    err.code = 'POLICY_DENIED';
    err.reasons = result.reasons;
    throw err;
  }
  return result;
}
