/**
 * @file swarm/agents/governanceAgent.js
 * @description GhostStack AI Swarm — Governance proposals agent.
 *
 * Listens for stale proposals (quorum reached but not executed), upcoming
 * vote deadlines, and execution windows.  Emits advisory proposals to the
 * signing relay — all ratification remains with human operators.
 */

import crypto from 'node:crypto';
import { swarmBus } from '../messaging/eventBus.js';

let _handled = 0;
let _proposed = 0;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, agent: 'governance', msg, ...extra }) + '\n'
  );
}

function propose(action, params, severity = 'info') {
  _proposed++;
  swarmBus.emit('swarm:proposal', {
    proposalId:  crypto.randomUUID(),
    agent:       'governance',
    action,
    params,
    severity,
    requestedBy: 'hyper-ghost-ai-swarm/governance-agent',
    ts:          Date.now(),
    // Governance proposals always marked advisory — never auto-executed
    advisory:    true,
  });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

swarmBus.on('anomaly:proposal_stale', (payload) => {
  _handled++;
  const { proposalId, title, quorumReached, hoursStale } = payload;
  log('info', 'proposal-stale', { proposalId, title, quorumReached, hoursStale });
  propose('alert_governance', {
    proposalId,
    title,
    reason: `Proposal has been in voting state for ${hoursStale}h (quorum reached=${quorumReached})`,
  }, 'info');
});

swarmBus.on('anomaly:quorum_reached', (payload) => {
  _handled++;
  const { proposalId, title, votesFor, votesAgainst } = payload;
  log('info', 'quorum-reached', { proposalId, title, votesFor, votesAgainst });
  propose('notify_ratifiers', {
    proposalId,
    title,
    outcome: votesFor > votesAgainst ? 'passed' : 'rejected',
    reason:  `Quorum reached: for=${votesFor} against=${votesAgainst}`,
  }, 'info');
});

swarmBus.on('anomaly:vote_deadline_approaching', (payload) => {
  _handled++;
  const { proposalId, title, hoursRemaining } = payload;
  log('info', 'vote-deadline', { proposalId, title, hoursRemaining });
  propose('alert_governance', {
    proposalId,
    title,
    reason: `Voting closes in ${hoursRemaining}h`,
  }, 'info');
});

export function getStats() {
  return { agent: 'governance', handled: _handled, proposed: _proposed };
}
