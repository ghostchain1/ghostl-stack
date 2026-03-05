/**
 * @file src/supervisor.js
 * @description Hyper Ghost AI core supervisor — role-based action pipeline with allowlist enforcement.
 *
 * Security model:
 *   1. Every action is role-checked (isPermitted).
 *   2. ALLOWLIST_REQUIRED_ACTIONS are validated against infra/safeops/allowlist.yml before dispatch.
 *   3. ALWAYS_AUDIT_ACTIONS produce immutable audit records.
 *   4. Executor actions are rate-limited (N per minute per category).
 *   5. Auditor can VETO any pending executor action before it runs.
 *   6. Governor actions require human countersignature token (GOVERNOR_APPROVAL_TOKEN env).
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Role, Action, isPermitted, ALLOWLIST_REQUIRED_ACTIONS, ALWAYS_AUDIT_ACTIONS } from './roles.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const ALLOWLIST_PATH = process.env.SAFEOPS_ALLOWLIST_PATH
  ?? new URL('../../../infra/safeops/allowlist.yml', import.meta.url).pathname;

const EXECUTOR_RATE_LIMIT = parseInt(process.env.EXECUTOR_RATE_LIMIT ?? '10', 10); // per minute
const GOVERNOR_TOKEN = process.env.GOVERNOR_APPROVAL_TOKEN; // fail-closed if unset

// ─── Allowlist loader ─────────────────────────────────────────────────────────

let _allowlist = null;
let _allowlistLoadedAt = 0;
const ALLOWLIST_TTL_MS = 60_000; // re-read every 60s

/**
 * Parses a minimal YAML-like allowlist (key: [values]) without external deps.
 * Supports only simple list format matching allowlist.yml structure.
 */
function parseAllowlist(text) {
  const result = {};
  let currentKey = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const keyMatch = line.match(/^(\w[\w-]*):\s*$/);
    if (keyMatch) { currentKey = keyMatch[1]; result[currentKey] = []; continue; }
    const listMatch = line.match(/^-\s+(.+)$/);
    if (listMatch && currentKey) { result[currentKey].push(listMatch[1].trim()); }
  }
  return result;
}

function loadAllowlist() {
  const now = Date.now();
  if (_allowlist && now - _allowlistLoadedAt < ALLOWLIST_TTL_MS) return _allowlist;

  if (!existsSync(ALLOWLIST_PATH)) {
    log('warn', 'allowlist-not-found', { path: ALLOWLIST_PATH });
    _allowlist = { allowed_actions: [], allowed_services: [], allowed_governors: [] };
  } else {
    const text = readFileSync(ALLOWLIST_PATH, 'utf8');
    _allowlist = parseAllowlist(text);
  }
  _allowlistLoadedAt = now;
  return _allowlist;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

/** @type {Array<object>} In-memory audit ring buffer (last 10000 entries) */
const _auditLog = [];
const AUDIT_MAX = 10000;

function auditRecord(entry) {
  const record = {
    ts: new Date().toISOString(),
    id: createHash('sha256').update(JSON.stringify(entry) + Date.now()).digest('hex').slice(0, 16),
    ...entry,
  };
  if (_auditLog.length >= AUDIT_MAX) _auditLog.shift();
  _auditLog.push(record);
  log('audit', entry.action || 'audit', record);
  return record;
}

export function getAuditLog(limit = 100) {
  return _auditLog.slice(-Math.abs(limit));
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const _rateBuckets = new Map(); // action → [timestamps]

function checkRateLimit(action) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const times = (_rateBuckets.get(action) ?? []).filter(t => t > windowStart);
  if (times.length >= EXECUTOR_RATE_LIMIT) return false;
  times.push(now);
  _rateBuckets.set(action, times);
  return true;
}

// ─── Veto registry ────────────────────────────────────────────────────────────

const _vetoed = new Set(); // set of action requestIds

export function vetoAction(requestId, auditorId, reason) {
  _vetoed.add(requestId);
  auditRecord({ event: 'VETO', requestId, auditorId, reason });
  log('warn', 'action-vetoed', { requestId, auditorId, reason });
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level, event, extra = {}) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, event, ...extra }) + '\n');
}

// ─── Core dispatch ────────────────────────────────────────────────────────────

/**
 * Core action dispatcher. Validates role, allowlist, rate limit, veto, then executes.
 *
 * @param {object} opts
 * @param {string} opts.role           - Requesting role (Role enum)
 * @param {string} opts.action         - Action to perform (Action enum)
 * @param {object} opts.params         - Action parameters
 * @param {string} opts.requestId      - Unique request ID
 * @param {string} [opts.governorToken] - Required for Governor actions
 * @param {Function} opts.handler      - Actual handler function (async)
 *
 * @returns {Promise<{ ok: boolean, result?: any, error?: string, audit: object }>}
 */
export async function dispatch({ role, action, params, requestId, governorToken, handler }) {
  const baseAudit = { role, action, params, requestId };

  // 1. Role permission check
  if (!isPermitted(role, action)) {
    const err = `Role ${role} is not permitted to perform ${action}`;
    log('warn', 'permission-denied', { ...baseAudit });
    return { ok: false, error: err, audit: auditRecord({ ...baseAudit, result: 'DENIED', reason: 'role-permission' }) };
  }

  // 2. Governor requires human approval token
  if (role === Role.GOVERNOR) {
    if (!GOVERNOR_TOKEN) {
      const err = 'Governor actions disabled: GOVERNOR_APPROVAL_TOKEN not set';
      log('warn', 'governor-disabled', baseAudit);
      return { ok: false, error: err, audit: auditRecord({ ...baseAudit, result: 'DENIED', reason: 'governor-disabled' }) };
    }
    if (governorToken !== GOVERNOR_TOKEN) {
      log('warn', 'governor-token-invalid', { requestId, role });
      return { ok: false, error: 'Invalid governor approval token', audit: auditRecord({ ...baseAudit, result: 'DENIED', reason: 'invalid-governor-token' }) };
    }
  }

  // 3. Allowlist check
  if (ALLOWLIST_REQUIRED_ACTIONS.has(action)) {
    const al = loadAllowlist();
    const allowed = al.allowed_actions ?? [];
    if (!allowed.includes(action)) {
      const err = `Action ${action} not in safeops allowlist`;
      log('warn', 'not-in-allowlist', { ...baseAudit });
      return { ok: false, error: err, audit: auditRecord({ ...baseAudit, result: 'DENIED', reason: 'not-in-allowlist' }) };
    }
    // Service allowlist check
    if (params?.service) {
      const allowedSvc = al.allowed_services ?? [];
      if (allowedSvc.length > 0 && !allowedSvc.includes(params.service)) {
        const err = `Service ${params.service} not in safeops allowlist`;
        log('warn', 'service-not-allowlisted', { ...baseAudit, service: params.service });
        return { ok: false, error: err, audit: auditRecord({ ...baseAudit, result: 'DENIED', reason: 'service-not-allowlisted' }) };
      }
    }
  }

  // 4. Rate limiting (executor only)
  if (role === Role.EXECUTOR) {
    if (!checkRateLimit(action)) {
      const err = `Rate limit exceeded for ${action} (max ${EXECUTOR_RATE_LIMIT}/min)`;
      log('warn', 'rate-limit', { ...baseAudit });
      return { ok: false, error: err, audit: auditRecord({ ...baseAudit, result: 'DENIED', reason: 'rate-limit' }) };
    }
  }

  // 5. Veto check
  if (_vetoed.has(requestId)) {
    const err = `Action ${requestId} was vetoed by Auditor`;
    log('warn', 'vetoed', { requestId });
    return { ok: false, error: err, audit: auditRecord({ ...baseAudit, result: 'VETOED' }) };
  }

  // 6. Execute
  log('info', 'dispatch', { ...baseAudit });
  try {
    const result = await handler(params);
    const audit = ALWAYS_AUDIT_ACTIONS.has(action)
      ? auditRecord({ ...baseAudit, result: 'OK', output: result })
      : null;
    return { ok: true, result, audit };
  } catch (err) {
    log('error', 'dispatch-error', { ...baseAudit, error: err.message });
    return { ok: false, error: err.message, audit: auditRecord({ ...baseAudit, result: 'ERROR', error: err.message }) };
  }
}

// ─── Built-in handlers ────────────────────────────────────────────────────────

/**
 * Registry of built-in supervisor action handlers.
 * Extend this by adding handlers matching Action enum values.
 */
export const HANDLERS = {
  [Action.COLLECT_METRICS]: async ({ targets }) => {
    return { collected: targets ?? [], ts: Date.now() };
  },

  [Action.HEALTH_CHECK]: async ({ service }) => {
    return { service: service ?? 'all', status: 'ok', ts: Date.now() };
  },

  [Action.CLASSIFY_ANOMALY]: async ({ metrics }) => {
    // Stub: real impl would call ML model or rules engine
    const anomaly = metrics?.errorRate > 0.1 ? 'HIGH' : metrics?.errorRate > 0.01 ? 'MEDIUM' : 'LOW';
    return { severity: anomaly, confidence: 0.85 };
  },

  [Action.CREATE_PLAN]: async ({ anomaly }) => {
    const plans = {
      HIGH: [{ step: 1, action: Action.RESTART_SERVICE }, { step: 2, action: Action.COLLECT_METRICS }],
      MEDIUM: [{ step: 1, action: Action.FLUSH_CACHE }],
      LOW: [{ step: 1, action: Action.COLLECT_METRICS }],
    };
    return { plan: plans[anomaly?.severity] ?? plans.LOW };
  },

  [Action.RESTART_SERVICE]: async ({ service }) => {
    // Stub: real impl would call Docker/K8s API
    return { service, restarted: true, ts: Date.now() };
  },

  [Action.FLUSH_CACHE]: async ({ target }) => {
    return { target: target ?? 'redis', flushed: true, ts: Date.now() };
  },

  [Action.EMIT_AUDIT_RECORD]: async ({ record }) => {
    return auditRecord({ event: 'MANUAL_AUDIT', ...record });
  },

  [Action.ESCALATE_TO_GOVERNANCE]: async ({ reason, severity }) => {
    // Stub: real impl would call governance-bundle createBundle + dtn-relay push
    return { escalated: true, reason, severity, ts: Date.now() };
  },

  [Action.EMERGENCY_HALT]: async ({ target, reason }) => {
    log('warn', 'EMERGENCY-HALT', { target, reason });
    return { halted: target, reason, ts: Date.now() };
  },
};

export { Role, Action };
