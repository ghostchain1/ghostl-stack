// proposalSubmitter — forwards an EvolutionProposal to the signing relay
// for human ratification.  Does not interact with governance contracts directly
// and does not autonomously deploy any protocol changes.
import type { EvolutionProposal } from '../types.js';
import { RULES } from '../config/evolutionRules.js';

export async function submitProposal(proposal: EvolutionProposal): Promise<EvolutionProposal> {
  // Attach relay metadata before sending
  const body = {
    ...proposal,
    relayTarget: 'ghostchain-governance',
    requiresHumanApproval: true,
    submittedBy: 'ghost-protocol-evolution',
    submittedAt: new Date().toISOString(),
  };

  try {
    const resp = await fetch(`${RULES.signingRelayUrl}/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      console.warn(`[proposalSubmitter] signing relay returned ${resp.status} for proposal ${proposal.id}`);
      return { ...proposal, status: 'submit_failed' };
    }

    console.info(`[proposalSubmitter] proposal ${proposal.id} forwarded to signing relay — awaiting human ratification`);
    return { ...proposal, status: 'submitted' };
  } catch (err) {
    console.warn(`[proposalSubmitter] signing relay unreachable for proposal ${proposal.id}:`, (err as Error).message);
    return { ...proposal, status: 'submit_failed' };
  }
}
