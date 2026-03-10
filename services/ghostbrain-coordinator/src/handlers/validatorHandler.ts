// validatorHandler — converts validator.alert into a governance proposal
// All write actions require human approval via signing relay.
import { randomUUID } from 'crypto';
import type { SwarmMessage, SwarmProposal } from '../swarmProtocol.js';

const SIGNING_RELAY_URL = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';

function buildAction(msg: SwarmMessage): string {
  switch (msg.type) {
    case 'high_cpu':
      return `Investigate high CPU on validator ${msg.agentId} (${msg.value?.toFixed(1) ?? '?'}%)`;
    case 'low_uptime':
      return `Review recent restart of validator ${msg.agentId} (uptime ${msg.value ?? '?'}s)`;
    case 'validator_jailed':
      return `Unjail validator ${msg.agentId} and investigate missed blocks`;
    default:
      return `Investigate validator alert "${msg.type}" on ${msg.agentId}`;
  }
}

export async function handleValidatorAlert(msg: SwarmMessage): Promise<SwarmProposal> {
  const proposal: SwarmProposal = {
    id: randomUUID(),
    source: 'swarm-coordinator',
    trigger: msg,
    action: buildAction(msg),
    rationale: msg.detail,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    const resp = await fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proposal),
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      console.warn(`[validatorHandler] signing relay ${resp.status} for proposal ${proposal.id}`);
    } else {
      console.info(`[validatorHandler] proposal ${proposal.id} forwarded to signing relay`);
    }
  } catch (err) {
    console.warn('[validatorHandler] signing relay unreachable:', (err as Error).message);
  }

  return proposal;
}
