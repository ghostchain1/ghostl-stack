// networkHandler — converts network.alert into a governance proposal
import { randomUUID } from 'crypto';
import type { SwarmMessage, SwarmProposal } from '../swarmProtocol.js';

const SIGNING_RELAY_URL = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';

function buildAction(msg: SwarmMessage): string {
  switch (msg.type) {
    case 'low_peers':
      return `Investigate peer connectivity on ${msg.agentId} — only ${msg.value ?? '?'} peers`;
    case 'chain_degraded':
      return `Investigate chain status "${msg.payload['chainStatus']}" on ${msg.agentId}`;
    case 'block_lag':
      return `Investigate block lag of ${msg.value ?? '?'} on ${msg.agentId}`;
    default:
      return `Investigate network alert "${msg.type}" on ${msg.agentId}`;
  }
}

export async function handleNetworkAlert(msg: SwarmMessage): Promise<SwarmProposal> {
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
      console.warn(`[networkHandler] signing relay ${resp.status} for proposal ${proposal.id}`);
    } else {
      console.info(`[networkHandler] proposal ${proposal.id} forwarded to signing relay`);
    }
  } catch (err) {
    console.warn('[networkHandler] signing relay unreachable:', (err as Error).message);
  }

  return proposal;
}
