import { ProposalsList } from '../../src/modules/governance/components/ProposalsList';
import { VoteTracking } from '../../src/modules/governance/components/VoteTracking';
import { ExecutionQueue } from '../../src/modules/governance/components/ExecutionQueue';
import { DelegationPanel } from '../../src/modules/governance/components/DelegationPanel';
import { apiFetch } from '../../src/lib/api';
import type { Proposal, Vote } from '@ghostl/types/governance';

async function loadGovernance() {
  const proposals = await apiFetch<Proposal[]>('/governance/proposals', { fallback: [] }).catch(() => []);
  const votes = await apiFetch<Vote[]>('/governance/votes', { fallback: [] }).catch(() => []);
  return { proposals, votes };
}

export default async function GovernancePage() {
  const { proposals, votes } = await loadGovernance();
  const proposal = proposals[0] || {
    id: 'p1',
    title: 'Placeholder proposal',
    status: 'draft' as const,
    quorum: 0,
    votesFor: 0,
    votesAgainst: 0
  };
  const queue = [{ id: 'exec-1', eta: new Date().toISOString(), action: 'Upgrade rollup', status: 'queued' as const }];
  const delegations = [{ delegator: '0xabc', delegate: '0xdef', weight: 1 }];
  return (
    <div className="content">
      <div className="card-grid">
        <ProposalsList proposals={proposals} />
        <VoteTracking proposal={proposal} votes={votes} />
        <ExecutionQueue queue={queue} />
        <DelegationPanel delegations={delegations} />
      </div>
    </div>
  );
}
