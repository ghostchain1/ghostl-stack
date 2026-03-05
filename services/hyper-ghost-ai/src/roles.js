/**
 * @file src/roles.js
 * @description Hyper Ghost AI role definitions, permissions, and capability matrix.
 *
 * Roles (ordered by privilege level, ascending):
 *   OBSERVER      — read-only telemetry collection, no side effects
 *   DIAGNOSTICIAN — correlates alerts, classifies anomalies, no side effects
 *   PLANNER       — generates remediation plans, creates proposals (no execution)
 *   EXECUTOR      — executes allowlisted actions only (rate-limited)
 *   AUDITOR       — reviews all AI decisions, can VETO executor actions
 *   GOVERNOR      — governance-layer escalation (requires human approval gate)
 *
 * Principle of Least Privilege:
 *   - Each role inherits NO permissions from higher roles.
 *   - Executor actions are constrained by infra/safeops/allowlist.yml.
 *   - Governor actions require explicit human countersignature.
 */

/** @enum {string} */
export const Role = Object.freeze({
  OBSERVER:      'OBSERVER',
  DIAGNOSTICIAN: 'DIAGNOSTICIAN',
  PLANNER:       'PLANNER',
  EXECUTOR:      'EXECUTOR',
  AUDITOR:       'AUDITOR',
  GOVERNOR:      'GOVERNOR',
});

/** @enum {string} */
export const Action = Object.freeze({
  // Observer
  COLLECT_METRICS:         'COLLECT_METRICS',
  READ_LOGS:               'READ_LOGS',
  HEALTH_CHECK:            'HEALTH_CHECK',

  // Diagnostician
  CORRELATE_ALERTS:        'CORRELATE_ALERTS',
  CLASSIFY_ANOMALY:        'CLASSIFY_ANOMALY',
  GENERATE_DIAGNOSIS:      'GENERATE_DIAGNOSIS',

  // Planner
  CREATE_PLAN:             'CREATE_PLAN',
  ESTIMATE_IMPACT:         'ESTIMATE_IMPACT',
  REQUEST_APPROVAL:        'REQUEST_APPROVAL',

  // Executor (allowlist-gated)
  RESTART_SERVICE:         'RESTART_SERVICE',
  SCALE_SERVICE:           'SCALE_SERVICE',
  ROTATE_SECRET:           'ROTATE_SECRET',
  FLUSH_CACHE:             'FLUSH_CACHE',
  APPLY_CONFIG_PATCH:      'APPLY_CONFIG_PATCH',

  // Auditor
  REVIEW_DECISION:         'REVIEW_DECISION',
  VETO_ACTION:             'VETO_ACTION',
  EMIT_AUDIT_RECORD:       'EMIT_AUDIT_RECORD',

  // Governor (requires human approval)
  ESCALATE_TO_GOVERNANCE:  'ESCALATE_TO_GOVERNANCE',
  PUBLISH_GOVERNANCE_BUNDLE: 'PUBLISH_GOVERNANCE_BUNDLE',
  EMERGENCY_HALT:          'EMERGENCY_HALT',
});

/**
 * Role → allowed actions mapping.
 * @type {Record<string, Set<string>>}
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [Role.OBSERVER]: new Set([
    Action.COLLECT_METRICS,
    Action.READ_LOGS,
    Action.HEALTH_CHECK,
  ]),
  [Role.DIAGNOSTICIAN]: new Set([
    Action.CORRELATE_ALERTS,
    Action.CLASSIFY_ANOMALY,
    Action.GENERATE_DIAGNOSIS,
  ]),
  [Role.PLANNER]: new Set([
    Action.CREATE_PLAN,
    Action.ESTIMATE_IMPACT,
    Action.REQUEST_APPROVAL,
  ]),
  [Role.EXECUTOR]: new Set([
    Action.RESTART_SERVICE,
    Action.SCALE_SERVICE,
    Action.ROTATE_SECRET,
    Action.FLUSH_CACHE,
    Action.APPLY_CONFIG_PATCH,
  ]),
  [Role.AUDITOR]: new Set([
    Action.REVIEW_DECISION,
    Action.VETO_ACTION,
    Action.EMIT_AUDIT_RECORD,
  ]),
  [Role.GOVERNOR]: new Set([
    Action.ESCALATE_TO_GOVERNANCE,
    Action.PUBLISH_GOVERNANCE_BUNDLE,
    Action.EMERGENCY_HALT,
  ]),
});

/**
 * Returns true if the given role is permitted to perform the action.
 * @param {string} role
 * @param {string} action
 * @returns {boolean}
 */
export function isPermitted(role, action) {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

/**
 * Actions that require allowlist validation before execution.
 * @type {Set<string>}
 */
export const ALLOWLIST_REQUIRED_ACTIONS = new Set([
  Action.RESTART_SERVICE,
  Action.SCALE_SERVICE,
  Action.ROTATE_SECRET,
  Action.APPLY_CONFIG_PATCH,
  Action.EMERGENCY_HALT,
  Action.PUBLISH_GOVERNANCE_BUNDLE,
]);

/**
 * Actions that ALWAYS produce an audit record.
 * @type {Set<string>}
 */
export const ALWAYS_AUDIT_ACTIONS = new Set([
  Action.RESTART_SERVICE,
  Action.SCALE_SERVICE,
  Action.ROTATE_SECRET,
  Action.APPLY_CONFIG_PATCH,
  Action.VETO_ACTION,
  Action.EMERGENCY_HALT,
  Action.ESCALATE_TO_GOVERNANCE,
  Action.PUBLISH_GOVERNANCE_BUNDLE,
]);
