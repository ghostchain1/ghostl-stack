/**
 * GhostStack AI Vault — Vault Event Bus
 * Typed EventEmitter for intra-vault and cross-service communication.
 *
 * GhostBrain Core subscribes to these events to drive autonomous decisions:
 *   - security.alert   → evaluate threat, potentially quarantine
 *   - secret.rotated   → propagate new secret to dependents
 *   - key.rotated      → notify validators / bridge to hot-reload signing key
 *   - anomaly.detected → feed into GhostBrain learning loop
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { EventEmitter } from 'node:events';
import type { AnomalySignal } from '../ai/anomaly-detector.js';
import type { ThreatPrediction } from '../ai/threat-predictor.js';
import type { SecurityVerdict } from '../ai/security-brain.js';
import type { RotationDecision } from '../ai/secret-rotation-ai.js';

// ── Event Payload Types ────────────────────────────────────────────────────

export interface SecurityAlertPayload {
  verdict:    SecurityVerdict;
  actorId:    string;
  resource:   string;
  ts:         number;
  sourceIp?:  string;
}

export interface SecretRotatedPayload {
  path:       string;
  namespace:  string;
  reason:     string;
  urgency:    RotationDecision['urgency'];
  ts:         number;
  initiator:  string;   // actor id or 'ai-vault/rotation-ai'
}

export interface KeyRotatedPayload {
  keyId:      string;
  keyName:    string;
  layer:      string;   // 'l1' | 'l2' | 'l3' | 'all'
  purpose:    string;
  publicKey:  string;   // new public key (safe to share)
  reason:     string;
  ts:         number;
  initiator:  string;
}

export interface AnomalyDetectedPayload {
  signal:     AnomalySignal;
  actorId:    string;
  resource:   string;
  ts:         number;
}

export interface ThreatDetectedPayload {
  threat:     ThreatPrediction;
  actorId:    string;
  resource:   string;
  ts:         number;
}

export interface VaultHealthPayload {
  status:     'healthy' | 'degraded' | 'critical';
  component:  string;
  message:    string;
  ts:         number;
}

export interface AgentCommandPayload {
  commandId:  string;
  type:       'rotate' | 'revoke' | 'lock' | 'unlock' | 'quarantine' | 'alert';
  target:     string;   // vault:// path or actor id
  initiator:  string;   // GhostBrain agent id
  reason:     string;
  ts:         number;
}

export interface ComplianceReportPayload {
  framework:    string;
  score:        number;   // 0–100
  violations:   string[];
  ts:           number;
}

// ── Event Map ─────────────────────────────────────────────────────────────

export interface VaultEventMap {
  'security.alert':       [SecurityAlertPayload];
  'secret.rotated':       [SecretRotatedPayload];
  'key.rotated':          [KeyRotatedPayload];
  'anomaly.detected':     [AnomalyDetectedPayload];
  'threat.detected':      [ThreatDetectedPayload];
  'vault.health':         [VaultHealthPayload];
  'agent.command':        [AgentCommandPayload];
  'compliance.report':    [ComplianceReportPayload];
  'actor.blocked':        [{ actorId: string; reason: string; ts: number }];
  'actor.unblocked':      [{ actorId: string; reason: string; ts: number }];
  'vault.started':        [{ ts: number }];
  'vault.stopped':        [{ ts: number }];
}

// ── Typed EventEmitter ────────────────────────────────────────────────────

class TypedEventEmitter<TMap extends { [K in keyof TMap]: unknown[] }> {
  private readonly _ee = new EventEmitter();

  constructor() {
    // Allow many GhostBrain agents to subscribe simultaneously
    this._ee.setMaxListeners(64);
  }

  emit<K extends keyof TMap>(event: K, ...args: TMap[K]): boolean {
    return this._ee.emit(event as string, ...args);
  }

  on<K extends keyof TMap>(event: K, listener: (...args: TMap[K]) => void): this {
    this._ee.on(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends keyof TMap>(event: K, listener: (...args: TMap[K]) => void): this {
    this._ee.once(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof TMap>(event: K, listener: (...args: TMap[K]) => void): this {
    this._ee.off(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  removeAllListeners<K extends keyof TMap>(event?: K): this {
    this._ee.removeAllListeners(event as string | undefined);
    return this;
  }

  listenerCount<K extends keyof TMap>(event: K): number {
    return this._ee.listenerCount(event as string);
  }
}

// ── Singleton Bus ─────────────────────────────────────────────────────────

/**
 * Global vault event bus. Import this singleton anywhere in the vault
 * (or in GhostBrain) to publish / subscribe to vault events.
 *
 * @example
 * // Publishing (from inside the vault):
 * VaultEvents.emit('security.alert', { verdict, actorId, resource, ts: Date.now() });
 *
 * @example
 * // Subscribing (from GhostBrain connector):
 * VaultEvents.on('secret.rotated', ({ path, reason }) => {
 *   ghostBrain.notify('secret-rotated', { path, reason });
 * });
 */
export const VaultEvents = new TypedEventEmitter<VaultEventMap>();

// ── Helper Emitters ───────────────────────────────────────────────────────

export function emitSecurityAlert(
  verdict: SecurityVerdict,
  actorId: string,
  resource: string,
  sourceIp?: string,
): void {
  VaultEvents.emit('security.alert', {
    verdict, actorId, resource, ts: Date.now(),
    ...(sourceIp !== undefined && { sourceIp }),
  });
}

export function emitSecretRotated(
  path: string,
  initiator: string,
  decision: RotationDecision,
): void {
  VaultEvents.emit('secret.rotated', {
    path,
    namespace: path.split('/')[2] ?? 'unknown',
    reason:    decision.reason,
    urgency:   decision.urgency,
    ts:        Date.now(),
    initiator,
  });
}

export function emitKeyRotated(
  keyId: string,
  keyName: string,
  layer: string,
  purpose: string,
  publicKey: string,
  reason: string,
  initiator: string,
): void {
  VaultEvents.emit('key.rotated', {
    keyId, keyName, layer, purpose, publicKey, reason, ts: Date.now(), initiator,
  });
}

export function emitAnomaly(signal: AnomalySignal, resource: string): void {
  VaultEvents.emit('anomaly.detected', {
    signal, actorId: signal.actorId, resource, ts: Date.now(),
  });
}

export function emitThreat(threat: ThreatPrediction, resource: string): void {
  VaultEvents.emit('threat.detected', {
    threat, actorId: threat.actorId, resource, ts: Date.now(),
  });
}

export function emitAgentCommand(cmd: AgentCommandPayload): void {
  VaultEvents.emit('agent.command', cmd);
}
