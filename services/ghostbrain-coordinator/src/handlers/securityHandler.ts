// securityHandler — converts security.alert into a governance proposal
import { randomUUID } from 'crypto';
import type { SwarmMessage, SwarmProposal } from '../swarmProtocol.js';

const SIGNING_RELAY_URL = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';

function buildAction(msg: SwarmMessage): string {
  switch (msg.type) {
    case 'anomaly_detected':
      return `Review GhostBrain anomaly on ${msg.agentId}: ${msg.detail}`;
    case 'elevated_risk_score':
      return `Investigate elevated risk score ${msg.value?.toFixed(3) ?? '?'} on ${msg.agentId}`;
    default:
      return `Investigate security alert "${msg.type}" on ${msg.agentId}`;
  }
}

export async function handleSecurityAlert(msg: SwarmMessage): Promise<SwarmProposal> {
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
      console.warn(`[securityHandler] signing relay ${resp.status} for proposal ${proposal.id}`);
    } else {
      console.info(`[securityHandler] proposal ${proposal.id} forwarded to signing relay`);
    }
  } catch (err) {
    console.warn('[securityHandler] signing relay unreachable:', (err as Error).message);
  }

  return proposal;
}
