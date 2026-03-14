/**
 * @file swarm/agents/devopsAgent.js
 * @description GhostStack AI Swarm — DevOps / service lifecycle agent.
 *
 * Listens for service crash, high error rate, and deployment anomalies.
 * Emits a `swarm:proposal` for the orchestrator to submit to the signing relay.
 * NEVER restarts or redeploys services directly.
 */

import crypto from 'node:crypto';
import { swarmBus } from '../messaging/eventBus.js';

let _handled = 0;
let _proposed = 0;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, agent: 'devops', msg, ...extra }) + '\n'
  );
}

function propose(action, params, severity = 'warn') {
  _proposed++;
  swarmBus.emit('swarm:proposal', {
    proposalId:  crypto.randomUUID(),
    agent:       'devops',
    action,
    params,
    severity,
    requestedBy: 'hyper-ghost-ai-swarm/devops-agent',
    ts:          Date.now(),
  });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

swarmBus.on('anomaly:service_crash', (payload) => {
  _handled++;
  const { serviceName, exitCode, restartCount } = payload;
  log('error', 'service-crash', { serviceName, exitCode, restartCount });
  propose(restartCount > 3 ? 'rollback_service' : 'restart_service', {
    serviceName,
    exitCode,
    restartCount,
    reason: `service crashed (exit=${exitCode}, restarts=${restartCount})`,
  }, restartCount > 3 ? 'critical' : 'warn');
});

swarmBus.on('anomaly:high_error_rate', (payload) => {
  _handled++;
  const { serviceName, errorRate, threshold } = payload;
  log('warn', 'high-error-rate', { serviceName, errorRate, threshold });
  propose('alert_ops', {
    serviceName,
    reason: `error rate ${errorRate.toFixed(1)}% exceeds threshold ${threshold}%`,
  }, 'warn');
});

swarmBus.on('anomaly:deploy_failure', (payload) => {
  _handled++;
  const { serviceName, version, reason } = payload;
  log('error', 'deploy-failure', { serviceName, version, reason });
  propose('rollback_service', {
    serviceName,
    version,
    reason: `deploy failure: ${reason}`,
  }, 'critical');
});

export function getStats() {
  return { agent: 'devops', handled: _handled, proposed: _proposed };
}
