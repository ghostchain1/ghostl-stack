import { ProposalsList } from '../../src/modules/governance/components/ProposalsList';
import { VoteTracking } from '../../src/modules/governance/components/VoteTracking';
import { ExecutionQueue } from '../../src/modules/governance/components/ExecutionQueue';
import { DelegationPanel } from '../../src/modules/governance/components/DelegationPanel';
import { apiFetch } from '../../src/lib/api';
import type { Proposal, Vote } from '@ghostl/types/governance';

async function loadGovernance() {
  const proposals = await apiFetch<Proposal[]>('/governance/proposals', { fallback: [] }).catch(() => []);
  const votes = await apiFetch<Vote[]>('/governance/votes', { fallback: [] }).catch(() => []);
  const queue = await apiFetch<{ id: string; eta: string; action: string; status: string }[]>('/governance/queue', {
    fallback: []
  }).catch(() => []);
  const delegations = await apiFetch<{ delegator: string; delegate: string; weight: number }[]>('/governance/delegations', {
    fallback: []
  }).catch(() => []);
  return { proposals, votes, queue, delegations };
}

export default async function GovernancePage() {
  const { proposals, votes, queue, delegations } = await loadGovernance();
  const proposal =
    proposals[0] || ({
      id: 'placeholder',
      title: 'No proposals',
      status: 'draft',
      quorum: 0,
      votesFor: 0,
      votesAgainst: 0
    } as Proposal);
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
