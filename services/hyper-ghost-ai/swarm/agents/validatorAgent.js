/**
 * @file swarm/agents/validatorAgent.js
 * @description GhostStack AI Swarm — Validator health agent.
 *
 * Listens for validator-related anomalies (jailed, offline, missed blocks).
 * Emits a `swarm:proposal` for the orchestrator to submit to the signing relay.
 * NEVER executes infrastructure operations directly.
 */

import crypto from 'node:crypto';
import { swarmBus } from '../messaging/eventBus.js';

let _handled = 0;
let _proposed = 0;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, agent: 'validator', msg, ...extra }) + '\n'
  );
}

function propose(action, params, severity = 'warn') {
  _proposed++;
  swarmBus.emit('swarm:proposal', {
    proposalId:  crypto.randomUUID(),
    agent:       'validator',
    action,
    params,
    severity,
    requestedBy: 'hyper-ghost-ai-swarm/validator-agent',
    ts:          Date.now(),
  });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

swarmBus.on('anomaly:validator_jailed', (payload) => {
  _handled++;
  const { operatorAddress, moniker, jailedCount, totalValidators } = payload;
  log('warn', 'validator-jailed', { operatorAddress, moniker, jailedCount, totalValidators });
  if (jailedCount > 0 && totalValidators > 0 && jailedCount / totalValidators > 0.33) {
    propose('alert_consensus', {
      operatorAddress,
      moniker,
      reason: `${jailedCount}/${totalValidators} validators jailed — consensus at risk`,
    }, 'critical');
  } else {
    propose('restart_validator_service', {
      operatorAddress,
      moniker,
      reason: 'validator jailed',
    }, 'warn');
  }
});

swarmBus.on('anomaly:validator_offline', (payload) => {
  _handled++;
  const { operatorAddress, moniker } = payload;
  log('error', 'validator-offline', { operatorAddress, moniker });
  propose('restart_validator_service', {
    operatorAddress,
    moniker,
    reason: 'validator offline / unreachable',
  }, 'critical');
});

swarmBus.on('anomaly:missed_blocks', (payload) => {
  _handled++;
  const { moniker, missedBlocks, window } = payload;
  log('warn', 'missed-blocks', { moniker, missedBlocks, window });
  propose('alert_ops', {
    moniker,
    reason: `${missedBlocks} missed blocks in window of ${window}`,
  }, 'warn');
});

export function getStats() {
  return { agent: 'validator', handled: _handled, proposed: _proposed };
}
