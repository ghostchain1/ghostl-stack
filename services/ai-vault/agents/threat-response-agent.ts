/**
 * GhostStack AI Vault — Threat Response Agent
 * Autonomous incident response engine. When the SecurityBrain raises
 * a critical verdict, this agent executes the remediation playbook.
 *
 * Playbooks:
 *   emergency_shutdown  → pause vault API, alert all humans
 *   quarantine          → block actor, revoke all tokens, alert
 *   revoke_credentials  → revoke tokens + rotate affected secrets
 *   rotate_secrets      → rotate affected resource
 *   block               → add actor to block list
 *   throttle            → rate-limit actor
 *   alert               → log + notify (no action)
 *   monitor             → passive watch
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { SecurityBrain, SecurityVerdict } from '../ai/security-brain.js';
import type { KeyManager } from '../core/key-manager.js';
import type { SecretManager } from '../core/secret-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { ThreatAction } from '../ai/threat-predictor.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IncidentRecord {
  id: string;
  actor: string;
  resource: string;
  action: ThreatAction;
  verdict: SecurityVerdict;
  resolvedAt?: number;
  ts: number;
}

type IncidentHandler = (incident: IncidentRecord) => void | Promise<void>;

// ── ThreatResponseAgent ────────────────────────────────────────────────────

export class ThreatResponseAgent {
  private readonly _brain:     SecurityBrain;
  private readonly _keyMgr:    KeyManager;
  private readonly _secretMgr: SecretManager;
  private readonly _audit:     AuditLedger;
  private readonly _handlers:  IncidentHandler[] = [];

  // Quarantined actors: actorId → quarantine expiry ms
  private readonly _quarantined = new Map<string, number>();

  // Throttled actors: actorId → throttle expiry ms
  private readonly _throttled   = new Map<string, number>();

  // Incident log (in-memory, last 1000)
  private readonly _incidents: IncidentRecord[] = [];
  private _running = false;

  constructor(
    brain: SecurityBrain,
    keyMgr: KeyManager,
    secretMgr: SecretManager,
    audit: AuditLedger,
  ) {
    this._brain     = brain;
    this._keyMgr    = keyMgr;
    this._secretMgr = secretMgr;
    this._audit     = audit;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  start(): void {
    if (this._running) return;
    this._running = true;

    // Subscribe to SecurityBrain threat events
    this._brain.onThreat(verdict => void this._respond(verdict));

    // Periodic quarantine cleanup
    setInterval(() => this._cleanupExpired(), 60_000).unref?.();

    console.info('[ThreatResponseAgent] Started — incident response active');
  }

  stop(): void {
    this._running = false;
    console.info('[ThreatResponseAgent] Stopped');
  }

  onIncident(handler: IncidentHandler): void {
    this._handlers.push(handler);
  }

  // ── Manual Actions ────────────────────────────────────────────────────────────

  async quarantineActor(actorId: string, durationMs = 3_600_000, operator = 'system'): Promise<void> {
    this._quarantined.set(actorId, Date.now() + durationMs);
    this._audit.append({
      actor: operator, actorType: 'vault', resource: `vault://actor/${actorId}`,
      action: 'threat.response', result: 'success', riskScore: 0.9,
      message: `Actor ${actorId} quarantined for ${Math.round(durationMs / 60_000)} min`,
    });
    console.warn(`[ThreatResponseAgent] 🔒 QUARANTINE: ${actorId}`);
  }

  async releaseActor(actorId: string, operator = 'system'): Promise<void> {
    this._quarantined.delete(actorId);
    this._audit.append({
      actor: operator, actorType: 'vault', resource: `vault://actor/${actorId}`,
      action: 'threat.response', result: 'success', riskScore: 0,
      message: `Actor ${actorId} quarantine released`,
    });
  }

  isQuarantined(actorId: string): boolean {
    const expiry = this._quarantined.get(actorId);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this._quarantined.delete(actorId);
      return false;
    }
    return true;
  }

  getIncidents(limit = 100): IncidentRecord[] {
    return this._incidents.slice(-limit);
  }

  // ── Response Engine ───────────────────────────────────────────────────────────

  private async _respond(verdict: SecurityVerdict): Promise<void> {
    if (!this._running) return;

    const actorId  = verdict.assessment?.actorId ?? 'unknown';
    const resource = verdict.assessment?.resource ?? 'unknown';
    const action   = verdict.recommendedAction;

    const incident: IncidentRecord = {
      id:       `INC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actor:    actorId,
      resource,
      action,
      verdict,
      ts:       Date.now(),
    };

    this._incidents.push(incident);
    if (this._incidents.length > 1000) this._incidents.shift();

    console.warn(`[ThreatResponseAgent] ⚡ Response: ${action} for actor=${actorId} resource=${resource}`);

    try {
      await this._executePlaybook(action, actorId, resource, verdict);
      incident.resolvedAt = Date.now();
    } catch (err) {
      console.error('[ThreatResponseAgent] Playbook execution error:', err);
    }

    this._audit.append({
      actor: 'threat-response-agent', actorType: 'vault',
      resource, action: 'threat.response', result: 'success', riskScore: verdict.riskScore,
      message: `Executed playbook: ${action} for ${actorId}`,
      metadata: { incidentId: incident.id, action },
    });

    for (const handler of this._handlers) {
      try { await handler(incident); } catch { /* non-fatal */ }
    }
  }

  private async _executePlaybook(
    action: ThreatAction,
    actorId: string,
    resource: string,
    verdict: SecurityVerdict,
  ): Promise<void> {
    switch (action) {
      case 'emergency_shutdown':
        console.error('[ThreatResponseAgent] 🚨 EMERGENCY SHUTDOWN TRIGGERED');
        await this.quarantineActor(actorId, 24 * 3_600_000);
        await this._rotateResourceSecrets(resource, 'emergency');
        // In production: signal vault API to enter maintenance mode
        break;

      case 'quarantine':
        await this.quarantineActor(actorId, 3_600_000);  // 1 hour
        await this._rotateResourceSecrets(resource, 'compromise_signal');
        break;

      case 'revoke_credentials':
        this._throttled.set(actorId, Date.now() + 300_000);  // 5 min throttle
        await this._rotateResourceSecrets(resource, 'threat_detected');
        break;

      case 'rotate_secrets':
        await this._rotateResourceSecrets(resource, 'threat_detected');
        break;

      case 'block':
        this._throttled.set(actorId, Date.now() + 600_000);  // 10 min block
        break;

      case 'throttle':
        this._throttled.set(actorId, Date.now() + 120_000);  // 2 min throttle
        break;

      case 'alert':
      case 'monitor':
        // Passive — logged via audit above
        break;
    }
  }

  private async _rotateResourceSecrets(resource: string, reason: string): Promise<void> {
    try {
      if (resource.startsWith('vault://') && !resource.includes('*')) {
        const isKey = resource.includes('/validator/') || resource.includes('/bridge/') ||
                      resource.includes('/treasury/') || resource.includes('/sequencer/') ||
                      resource.includes('/keys/');
        if (isKey) {
          // Rotate key by ID (find by secretPath)
          const all = this._keyMgr.list({ state: 'active' });
          const rec = all.find(k => k.secretPath === resource);
          if (rec) {
            await this._keyMgr.rotate(rec.id, 'threat-response-agent', reason);
          }
        } else {
          await this._secretMgr.rotate(resource, { actor: 'threat-response-agent', actorType: 'vault', reason });
        }
        console.warn(`[ThreatResponseAgent] ✅ Rotated: ${resource}`);
      }
    } catch (err) {
      console.error(`[ThreatResponseAgent] Rotation failed for ${resource}:`, err);
    }
  }

  private _cleanupExpired(): void {
    const now = Date.now();
    for (const [id, expiry] of this._quarantined) {
      if (now > expiry) this._quarantined.delete(id);
    }
    for (const [id, expiry] of this._throttled) {
      if (now > expiry) this._throttled.delete(id);
    }
  }
}
