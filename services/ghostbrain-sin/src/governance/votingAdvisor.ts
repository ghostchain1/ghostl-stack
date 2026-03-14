// SIN — Voting Advisor
// Fetches active governance proposals and produces per-proposal AI voting
// recommendations for validators.  Recommendations are advisory only — all
// actual votes are cast by human validators through GhostChain governance.

import { randomUUID }   from 'crypto';
import { API_BASE }     from '../config/sinConfig.js';
import { SIN_RULES }    from '../config/sinRules.js';
import type { VoteAdvice } from '../types.js';

interface RawProposal {
  id?:          string;
  proposalId?:  string;
  title?:       string;
  description?: string;
  type?:        string;
  status?:      string;
  gasReductionPct?: number;
  validatorChange?: number;
  treasuryPct?: number;
}

function scoreProposal(p: RawProposal): { rec: VoteAdvice['recommendation']; reason: string; conf: number } {
  const desc = ((p.description ?? '') + ' ' + (p.title ?? '')).toLowerCase();

  // Favour proposals that reduce gas costs
  if (desc.includes('gas') && (desc.includes('reduc') || desc.includes('optim'))) {
    const pct = p.gasReductionPct ?? 10;
    return { rec: 'support', reason: `Estimated ${pct}% reduction in gas usage benefits all users`, conf: 0.82 };
  }

  // Oppose proposals that drop validators below safe minimum
  if (p.type === 'validator-distribution' && typeof p.validatorChange === 'number') {
    const safeDelta = p.validatorChange;
    if (safeDelta < 0 && SIN_RULES.minValidatorCount > 21 + safeDelta) {
      return { rec: 'oppose', reason: `Proposal would reduce validators below safe minimum of ${SIN_RULES.minValidatorCount}`, conf: 0.90 };
    }
  }

  // Treasury proposals that exceed reserve floor → oppose
  if (p.type === 'treasury-allocation' && typeof p.treasuryPct === 'number') {
    if (p.treasuryPct < SIN_RULES.treasuryReservePct) {
      return { rec: 'oppose', reason: `Allocation leaves reserve below ${SIN_RULES.treasuryReservePct}% sovereign floor`, conf: 0.88 };
    }
  }

  // Protocol upgrade proposals → generally support with moderate confidence
  if (p.type === 'protocol-upgrade' || desc.includes('upgrade') || desc.includes('protocol')) {
    return { rec: 'support', reason: 'Protocol upgrades improve network resilience and efficiency', conf: 0.65 };
  }

  // Quorum or governance parameter changes → abstain (humans decide)
  if (desc.includes('quorum') || desc.includes('governance') || desc.includes('constitution')) {
    return { rec: 'abstain', reason: 'Constitutional changes require direct human deliberation', conf: 0.95 };
  }

  // Unknown proposal type → abstain
  return { rec: 'abstain', reason: 'Insufficient context to form a confident recommendation', conf: 0.40 };
}

export async function adviseVotes(): Promise<VoteAdvice[]> {
  try {
    const res = await fetch(`${API_BASE}/api/governance/proposals?status=active`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { proposals?: RawProposal[]; data?: RawProposal[] } | RawProposal[];

    const proposals: RawProposal[] = Array.isArray(json)
      ? json
      : (json as { proposals?: RawProposal[]; data?: RawProposal[] }).proposals
        ?? (json as { proposals?: RawProposal[]; data?: RawProposal[] }).data
        ?? [];

    return proposals.slice(0, 10).map((p) => {
      const { rec, reason, conf } = scoreProposal(p);
      return {
        proposalId:     (p.id ?? p.proposalId ?? randomUUID()),
        title:          p.title ?? `Proposal ${p.id ?? '(unknown)'}`,
        recommendation: rec,
        confidence:     conf,
        reason,
        advisedAt:      Date.now(),
      } satisfies VoteAdvice;
    });
  } catch {
    // Governance API offline — return empty advisory list
    return [];
  }
}
