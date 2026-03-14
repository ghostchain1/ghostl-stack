/**
 * @file src/events/bus.js
 * @description Event bus for ghostbrain-gsa.
 *
 * Transport layer (in priority order):
 *  1. NATS JetStream (if nats npm package is present + NATS_ENABLED=true)
 *  2. HTTP callback to GhostBrain Core POST /api/v1/signals
 *  3. Local EventEmitter (fallback / test mode)
 *
 * All events conform to the GhostBrain Core BrainMessage<T> schema:
 *   { messageId, subject, correlationId, senderAgentId, payload, sentAt }
 *
 * NATS subjects used:
 *   ghostbrain.agent.register
 *   ghostbrain.gsa.finding
 *   ghostbrain.gsa.plan
 *   ghostbrain.gsa.patch
 *   ghostbrain.gsa.verify
 *   ghostbrain.gsa.policy
 *   ghostbrain.gsa.bundle
 *   ghostbrain.gsa.audit
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { outboundHeaders } from '../security/auth.js';

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

let natsConn = null;

/**
 * Attempt to connect to NATS. Silently falls back if unavailable.
 * The nats npm package is optional — only used if present.
 */
async function connectNats() {
  if (!config.natsEnabled) return;
  try {
    const { connect, StringCodec } = await import('nats');
    natsConn = await connect({ servers: config.natsUrl });
    natsConn._sc = StringCodec();
    console.log(`[bus] NATS connected: ${config.natsUrl}`);
  } catch (err) {
    console.warn(`[bus] NATS unavailable (${err.message}), falling back to HTTP callbacks`);
    natsConn = null;
  }
}

/**
 * Build a canonical BrainMessage envelope.
 * @param {string} subject
 * @param {unknown} payload
 * @param {string} [correlationId]
 * @returns {object}
 */
function envelope(subject, payload, correlationId = randomUUID()) {
  return {
    messageId:   randomUUID(),
    subject,
    correlationId,
    senderAgentId: config.agentId,
    payload,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Publish an event to GhostBrain Core via HTTP callback.
 * @param {object} msg - BrainMessage envelope
 */
async function publishHttp(msg) {
  if (!config.ghostbrainEnabled || !config.ghostbrainUrl) return;
  const body = JSON.stringify(msg);
  try {
    const headers = outboundHeaders(body);
    const url = new URL('/api/v1/signals', config.ghostbrainUrl);
    await fetch(url.toString(), {
      method:  'POST',
      headers,
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn(`[bus] HTTP publish failed (${err.message}) — event logged locally`);
  }
}

/**
 * Publish an event. Tries NATS → HTTP → local emitter.
 * @param {string} subject
 * @param {unknown} payload
 * @param {string} [correlationId]
 */
export async function publish(subject, payload, correlationId) {
  const msg = envelope(subject, payload, correlationId);
  emitter.emit(subject, msg);
  emitter.emit('*', msg);

  if (natsConn) {
    try {
      natsConn.publish(subject, natsConn._sc.encode(JSON.stringify(msg)));
      return;
    } catch (err) {
      console.warn(`[bus] NATS publish error: ${err.message}`);
    }
  }
  await publishHttp(msg);
}

/** Subscribe to local events (always works regardless of transport). */
export function subscribe(subject, handler) {
  emitter.on(subject, handler);
  return () => emitter.off(subject, handler);
}

/** Register agent with GhostBrain Core. */
export async function registerAgent() {
  const registration = {
    agentId:       config.agentId,
    role:          'auditor',
    capabilities:  ['policy.evaluate', 'metrics.query', 'logs.query'],
    resourceScopes: [{ type: 'stack', name: 'ghostl-stack', layer: 'L2' }],
    natsSubject:   'ghostbrain.gsa.commands',
    registeredAt:  new Date().toISOString(),
    lastSeen:      new Date().toISOString(),
    healthy:       true,
  };
  await publish('ghostbrain.agent.register', registration);
  console.log(`[bus] Agent registered: ${config.agentId}`);
}

/** Convenience event publishers */
export const events = {
  findingCreated:  (p, cid) => publish('ghostbrain.gsa.finding', p, cid),
  planCreated:     (p, cid) => publish('ghostbrain.gsa.plan',    p, cid),
  patchApplied:    (p, cid) => publish('ghostbrain.gsa.patch',   p, cid),
  verifyPassed:    (p, cid) => publish('ghostbrain.gsa.verify',  { ...p, passed: true  }, cid),
  verifyFailed:    (p, cid) => publish('ghostbrain.gsa.verify',  { ...p, passed: false }, cid),
  policyDenied:    (p, cid) => publish('ghostbrain.gsa.policy',  { ...p, denied: true  }, cid),
  bundleVerified:  (p, cid) => publish('ghostbrain.gsa.bundle',  p, cid),
  auditRecord:     (p, cid) => publish('ghostbrain.gsa.audit',   p, cid),
};

/** Initialize the bus (call once at startup). */
export async function initBus() {
  await connectNats();
  await registerAgent();
}

/** Graceful shutdown. */
export async function closeBus() {
  if (natsConn) { try { await natsConn.drain(); } catch { /* noop */ } }
}
