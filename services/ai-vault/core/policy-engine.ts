/**
 * GhostStack AI Vault — Policy Engine
 * Evaluates access requests against YAML-driven policies.
 * Supports: allow/deny rules, role requirements, source IP restrictions,
 * multisig requirements, and resource classification.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { readFileSync, watchFile } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import type { ActorIdentity } from './identity-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PolicyRule {
  path?: string;
  pathPrefix?: string;
  methods?: string[];
  actors?: string[];          // '*' = any, else array of actor types
  requireAuth?: boolean;
  roles?: string[];           // required roles (any match = ok)
  sourceIpPrefixes?: string[]; // allowed source IP prefixes
  requireMultisig?: boolean;
  reason?: string;
}

export interface AnomalyConfig {
  rateLimitPerMinute: number;
  burst: number;
  blockMs: number;
}

export interface Policy {
  version: string;
  defaultDecision: 'allow' | 'deny';
  anomaly: AnomalyConfig;
  allow: PolicyRule[];
  deny: PolicyRule[];
  rotate: Array<{
    name: string;
    path: string;
    intervalMs: number;
    keyLength?: number;
    encoding?: 'hex' | 'base64';
    keys?: string[];
    _lastRotated?: number;
  }>;
  resourceClasses: Record<string, string[]>;
  multisig: Record<string, { threshold: number; signers: number }>;
  compliance: { frameworks: string[]; auditRetentionDays: number; mirrorToGhostchain: boolean };
}

export interface PolicyDecision {
  decision: 'allow' | 'deny';
  reason: string;
  rule?: PolicyRule;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_POLICY: Policy = {
  version: '1.0',
  defaultDecision: 'deny',
  anomaly: { rateLimitPerMinute: 120, burst: 40, blockMs: 300_000 },
  allow: [],
  deny: [],
  rotate: [],
  resourceClasses: { critical: [], high: [], medium: [], low: [] },
  multisig: {},
  compliance: { frameworks: ['SOC2'], auditRetentionDays: 90, mirrorToGhostchain: false },
};

// ── PolicyEngine ───────────────────────────────────────────────────────────

export class PolicyEngine {
  private _policy: Policy = { ...DEFAULT_POLICY };
  private readonly _policyPath: string;
  private readonly _policyWrite: boolean;

  constructor(policyPath: string, policyWrite = false) {
    this._policyPath = resolve(policyPath);
    this._policyWrite = policyWrite;
    this.load();
    this._watch();
  }

  // ── Load / Save ──────────────────────────────────────────────────────────

  load(): void {
    try {
      const raw = readFileSync(this._policyPath, 'utf8');
      const parsed = yaml.load(raw) as Partial<Policy>;
      this._policy = { ...DEFAULT_POLICY, ...parsed } as Policy;
    } catch (err) {
      console.warn(`[policy-engine] failed to load ${this._policyPath}: ${(err as Error).message}`);
    }
  }

  update(partial: Partial<Policy>): void {
    this._policy = { ...this._policy, ...partial } as Policy;
    if (this._policyWrite) this._save();
  }

  private _save(): void {
    try {
      const { writeFileSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(this._policyPath, yaml.dump(this._policy), 'utf8');
    } catch (err) {
      console.error(`[policy-engine] save failed: ${(err as Error).message}`);
    }
  }

  private _watch(): void {
    try {
      watchFile(this._policyPath, { interval: 10_000 }, () => {
        console.log('[policy-engine] policy file changed, reloading');
        this.load();
      });
    } catch {
      // watchFile may fail in restricted environments — non-fatal
    }
  }

  get policy(): Policy {
    return this._policy;
  }

  // ── Evaluation ───────────────────────────────────────────────────────────

  /**
   * Evaluate an access request. Returns allow/deny with reason.
   *
   * @param path      Request path (e.g. /vault/secret/db/password)
   * @param method    HTTP method
   * @param actor     Resolved actor identity
   * @param sourceIp  Client IP address
   * @param blocked   Whether actor is currently blocked by rate-limit enforcement
   */
  evaluate(
    path: string,
    method: string,
    actor: ActorIdentity,
    sourceIp: string,
    blocked: boolean,
  ): PolicyDecision {
    if (blocked) {
      return { decision: 'deny', reason: 'actor_blocked_rate_limit' };
    }

    // Revoked actors always denied
    if (actor.roles.length === 0 && actor.type === 'unknown') {
      // Allow unauthenticated only if a specific allow rule covers it
    }

    // 1. Check deny rules first (explicit denials override all)
    for (const rule of this._policy.deny) {
      if (this._matchRule(rule, path, method, actor, sourceIp)) {
        return { decision: 'deny', reason: rule.reason ?? 'policy_deny', rule };
      }
    }

    // 2. Check allow rules
    for (const rule of this._policy.allow) {
      if (this._matchRule(rule, path, method, actor, sourceIp)) {
        // Check role requirements
        if (rule.roles && rule.roles.length > 0) {
          const hasRole = rule.roles.some(r => actor.roles.includes(r) || actor.roles.includes('vault-admin'));
          if (!hasRole) {
            return { decision: 'deny', reason: 'insufficient_roles', rule };
          }
        }
        return { decision: 'allow', reason: 'policy_allow', rule };
      }
    }

    // 3. Default decision
    return { decision: this._policy.defaultDecision, reason: 'default' };
  }

  private _matchRule(
    rule: PolicyRule,
    path: string,
    method: string,
    actor: ActorIdentity,
    sourceIp: string,
  ): boolean {
    // Method check
    if (rule.methods && !rule.methods.includes(method)) return false;

    // Path check
    const pathMatch =
      (rule.path && rule.path === path) ||
      (rule.pathPrefix && path.startsWith(rule.pathPrefix));
    if (!pathMatch) return false;

    // Actor type check
    if (rule.actors && !rule.actors.includes('*')) {
      if (!rule.actors.includes(actor.type)) return false;
    }

    // Source IP prefix check
    if (rule.sourceIpPrefixes && rule.sourceIpPrefixes.length > 0) {
      const allowed = rule.sourceIpPrefixes.some(prefix => sourceIp.startsWith(prefix));
      if (!allowed) return false;
    }

    return true;
  }

  // ── Resource Classification ───────────────────────────────────────────────

  /** Classify a resource path as critical/high/medium/low. */
  classifyResource(resourcePath: string): 'critical' | 'high' | 'medium' | 'low' | 'unknown' {
    const classes = this._policy.resourceClasses;
    for (const level of ['critical', 'high', 'medium', 'low'] as const) {
      const patterns = classes[level] ?? [];
      for (const pattern of patterns) {
        if (this._globMatch(pattern, resourcePath)) return level;
      }
    }
    return 'unknown';
  }

  private _globMatch(pattern: string, str: string): boolean {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(str);
  }

  // ── Rotation access ───────────────────────────────────────────────────────

  get rotationSchedule() {
    return this._policy.rotate;
  }

  get anomalyConfig(): AnomalyConfig {
    return this._policy.anomaly;
  }

  get multisigConfig(): Record<string, { threshold: number; signers: number }> {
    return this._policy.multisig;
  }

  get complianceConfig() {
    return this._policy.compliance;
  }
}
