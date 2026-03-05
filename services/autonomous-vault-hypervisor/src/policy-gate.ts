// policy-gate.ts — policy enforcement for autonomous actions
// Enforces routing law (AGENTS.md §1: L3→L2→L1 only)
// Maintains allow/deny rule sets loaded from policy.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CFG } from './config.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import type { Policy, PolicyRule, RotationRule, GhostLayer } from './types.js';

let policy: Policy = {
  allowActions: [],
  denyActions: [],
  emergencyLock: false,
  maxAutoRestarts: { vms: 3, containers: 5 },
  rotations: [],
};

export function loadPolicy(): void {
  if (!existsSync(CFG.policyPath)) {
    logger.warn('Policy file not found — using permissive defaults', { path: CFG.policyPath });
    return;
  }
  try {
    const raw = readFileSync(CFG.policyPath, 'utf-8');
    policy = JSON.parse(raw) as Policy;
    logger.info('Policy loaded', { path: CFG.policyPath, rules: policy.allowActions.length + policy.denyActions.length });
  } catch (err) {
    logger.error('Policy load failed — using defaults', { err: String(err) });
  }
}

export function savePolicy(): void {
  try {
    writeFileSync(CFG.policyPath, JSON.stringify(policy, null, 2));
  } catch (err) {
    logger.warn('Policy save failed', { err: String(err) });
  }
}

export function getPolicy(): Policy { return policy; }
export function setPolicy(p: Policy): void { policy = p; savePolicy(); }

/** Enforce AGENTS.md §1 routing law: L3→L2 only, L2→L1 only, L3→L1 FORBIDDEN */
export function assertRoutingLaw(source: GhostLayer, target: GhostLayer): void {
  if (source === 'L3' && target === 'L1') {
    throw new Error('ROUTE_LAW_VIOLATION:l3_l1_bypass_blocked');
  }
  if (source === 'L3' && target !== 'L2' && target !== 'L3') {
    throw new Error(`ROUTE_LAW_VIOLATION:l3_to_${target}_blocked`);
  }
}

function matchRule(rule: PolicyRule, action: string, target: string, layer?: string): boolean {
  if (rule.action && rule.action !== '*' && rule.action !== action) return false;
  if (rule.target && rule.target !== '*' && !target.includes(rule.target)) return false;
  if (rule.layer && rule.layer !== '*' && rule.layer !== layer) return false;
  return true;
}

/** Check a proposed action against the policy */
export function checkAction(
  action: string,
  target: string,
  layer?: string,
  sourceLayer?: string,
): { allowed: boolean; reason: string } {
  // Emergency lock overrides everything
  if (CFG.emergencyLock || policy.emergencyLock) {
    metrics.policyDenials++;
    return { allowed: false, reason: 'emergency_lock_active' };
  }
  // Execute gate
  if (!CFG.executeActions) {
    metrics.policyDenials++;
    return { allowed: false, reason: 'execute_actions_disabled' };
  }
  // Routing law check
  if (sourceLayer && layer) {
    try {
      assertRoutingLaw(sourceLayer as GhostLayer, layer as GhostLayer);
    } catch (err) {
      metrics.policyDenials++;
      const msg = err instanceof Error ? err.message : String(err);
      return { allowed: false, reason: msg };
    }
  }
  // Explicit deny rules
  for (const rule of policy.denyActions) {
    if (matchRule(rule, action, target, layer)) {
      metrics.policyDenials++;
      return { allowed: false, reason: rule.reason ?? 'policy_deny' };
    }
  }
  // Explicit allow rules
  for (const rule of policy.allowActions) {
    if (matchRule(rule, action, target, layer)) {
      return { allowed: true, reason: rule.reason ?? 'policy_allow' };
    }
  }
  // Default: allow autonomous remediation actions
  return { allowed: true, reason: 'default_allow' };
}

/** Access the rotation schedule from policy */
export function getRotations(): RotationRule[] {
  return policy.rotations ?? [];
}

/** Update rotation tracking after successful rotation */
export function markRotated(idx: number): void {
  if (policy.rotations?.[idx]) {
    policy.rotations[idx]._lastRotated = Date.now();
    savePolicy();
  }
}

export function maxAutoRestarts(): { vms: number; containers: number } {
  return policy.maxAutoRestarts ?? { vms: 3, containers: 5 };
}
