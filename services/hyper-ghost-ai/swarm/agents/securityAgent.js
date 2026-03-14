/**
 * @file swarm/agents/securityAgent.js
 * @description GhostStack AI Swarm — Security / threat detection agent.
 *
 * Listens for intrusion events, suspicious traffic spikes, failed auth bursts,
 * and compliance violations.  Emits proposals to the signing relay.
 * NEVER blocks IPs or revokes keys directly.
 */

import crypto from 'node:crypto';
import { swarmBus } from '../messaging/eventBus.js';

let _handled = 0;
let _proposed = 0;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, agent: 'security', msg, ...extra }) + '\n'
  );
}

function propose(action, params, severity = 'warn') {
  _proposed++;
  swarmBus.emit('swarm:proposal', {
    proposalId:  crypto.randomUUID(),
    agent:       'security',
    action,
    params,
    severity,
    requestedBy: 'hyper-ghost-ai-swarm/security-agent',
    ts:          Date.now(),
  });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

swarmBus.on('anomaly:intrusion', (payload) => {
  _handled++;
  const { sourceIp, targetService, method } = payload;
  // Sanitise before logging — IPs from external sources
  const safeIp = typeof sourceIp === 'string' && /^[\d.:a-fA-F/]+$/.test(sourceIp) ? sourceIp : 'unknown';
  log('error', 'intrusion-detected', { sourceIp: safeIp, targetService, method });
  propose('block_ip', {
    ip:       safeIp,
    reason:   `Intrusion detected: ${method} against ${targetService}`,
    method,
  }, 'critical');
});

swarmBus.on('anomaly:suspicious_traffic', (payload) => {
  _handled++;
  const { sourceIp, requestsPerMinute, threshold } = payload;
  const safeIp = typeof sourceIp === 'string' && /^[\d.:a-fA-F/]+$/.test(sourceIp) ? sourceIp : 'unknown';
  log('warn', 'suspicious-traffic', { sourceIp: safeIp, requestsPerMinute, threshold });
  propose('rate_limit_ip', {
    ip:     safeIp,
    reason: `Traffic spike: ${requestsPerMinute} req/min > threshold ${threshold}`,
  }, 'warn');
});

swarmBus.on('anomaly:auth_failure_burst', (payload) => {
  _handled++;
  const { sourceIp, failures, windowSeconds } = payload;
  const safeIp = typeof sourceIp === 'string' && /^[\d.:a-fA-F/]+$/.test(sourceIp) ? sourceIp : 'unknown';
  log('warn', 'auth-failure-burst', { sourceIp: safeIp, failures, windowSeconds });
  propose('block_ip', {
    ip:     safeIp,
    reason: `${failures} auth failures in ${windowSeconds}s`,
  }, failures > 100 ? 'critical' : 'warn');
});

swarmBus.on('anomaly:compliance_violation', (payload) => {
  _handled++;
  const { ruleId, description, entityId } = payload;
  log('warn', 'compliance-violation', { ruleId, entityId });
  propose('alert_compliance', {
    ruleId,
    entityId,
    reason: description ?? `Compliance rule ${ruleId} violated`,
  }, 'warn');
});

export function getStats() {
  return { agent: 'security', handled: _handled, proposed: _proposed };
}
