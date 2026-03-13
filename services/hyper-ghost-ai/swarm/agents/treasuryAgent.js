/**
 * @file swarm/agents/treasuryAgent.js
 * @description GhostStack AI Swarm — Treasury & economics agent.
 *
 * Listens for reserve ratio drops, burn threshold breaches, and distribution
 * anomalies.  Emits proposals to the signing relay for human ratification.
 * NEVER modifies token supply or treasury balances directly.
 */

import crypto from 'node:crypto';
import { swarmBus } from '../messaging/eventBus.js';

let _handled = 0;
let _proposed = 0;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, agent: 'treasury', msg, ...extra }) + '\n'
  );
}

function propose(action, params, severity = 'warn') {
  _proposed++;
  swarmBus.emit('swarm:proposal', {
    proposalId:  crypto.randomUUID(),
    agent:       'treasury',
    action,
    params,
    severity,
    requestedBy: 'hyper-ghost-ai-swarm/treasury-agent',
    ts:          Date.now(),
  });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

swarmBus.on('anomaly:low_reserve', (payload) => {
  _handled++;
  const { reserveRatio, threshold } = payload;
  log('warn', 'low-reserve', { reserveRatio, threshold });
  propose('pause_distributions', {
    reason: `reserve ratio ${(reserveRatio * 100).toFixed(2)}% below threshold ${(threshold * 100).toFixed(2)}%`,
    reserveRatio,
  }, reserveRatio < threshold * 0.5 ? 'critical' : 'warn');
});

swarmBus.on('anomaly:burn_threshold', (payload) => {
  _handled++;
  const { burnRateGST, maxBurnRateGST } = payload;
  log('warn', 'burn-threshold-exceeded', { burnRateGST, maxBurnRateGST });
  propose('alert_treasury', {
    reason: `burn rate ${burnRateGST} GST/hr exceeds max ${maxBurnRateGST} GST/hr`,
    burnRateGST,
    maxBurnRateGST,
  }, 'warn');
});

swarmBus.on('anomaly:distribution_failure', (payload) => {
  _handled++;
  const { epochId, reason } = payload;
  log('error', 'distribution-failure', { epochId, reason });
  propose('retry_distribution', {
    epochId,
    reason: `distribution failed: ${reason}`,
  }, 'critical');
});

export function getStats() {
  return { agent: 'treasury', handled: _handled, proposed: _proposed };
}
