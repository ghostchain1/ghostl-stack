/**
 * @file swarm/agents/nocAgent.js
 * @description GhostStack AI Swarm — Network Operations Centre agent.
 *
 * Listens for anomalies related to containers, VMs, and service nodes.
 * Emits a `swarm:proposal` for the orchestrator to submit to the signing relay.
 * NEVER executes infrastructure operations directly.
 */

import crypto from 'node:crypto';
import { swarmBus } from '../messaging/eventBus.js';

let _handled = 0;
let _proposed = 0;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, agent: 'noc', msg, ...extra }) + '\n'
  );
}

/** Build and emit a proposal for the signing relay. */
function propose(action, params, severity = 'warn') {
  _proposed++;
  swarmBus.emit('swarm:proposal', {
    proposalId:  crypto.randomUUID(),
    agent:       'noc',
    action,
    params,
    severity,
    requestedBy: 'hyper-ghost-ai-swarm/noc-agent',
    ts:          Date.now(),
  });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

swarmBus.on('anomaly:container', (payload) => {
  _handled++;
  const { name, state, containerId } = payload;
  if (!name) return;
  log('warn', 'container-anomaly', { name, state });
  propose('restart_container', { name, containerId, reason: `container state=${state}` }, 'warn');
});

swarmBus.on('anomaly:vm', (payload) => {
  _handled++;
  const { name, state, cpuPercent, ramPercent } = payload;
  if (!name) return;
  const reason = state ? `vm state=${state}` : `resources cpu=${cpuPercent}% ram=${ramPercent}%`;
  log('warn', 'vm-anomaly', { name, state, cpuPercent, ramPercent });
  propose('restart_vm', { name, reason }, state === 'error' ? 'critical' : 'warn');
});

swarmBus.on('anomaly:node_offline', (payload) => {
  _handled++;
  const { serviceName, port } = payload;
  log('error', 'node-offline', { serviceName, port });
  propose('alert_ops', { serviceName, port, reason: 'node unreachable' }, 'critical');
});

export function getStats() {
  return { agent: 'noc', handled: _handled, proposed: _proposed };
}
