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
  const snapshot = await apiFetch<{ space: string; proposals: { id: string; title: string; status: string; link: string }[] }>(
    '/governance/snapshot',
    { fallback: { space: 'snapshot', proposals: [] } }
  ).catch(() => ({ space: 'snapshot', proposals: [] }));
  const forum = await apiFetch<{ forum: string; threads: { id: string; title: string; url: string; replies: number }[] }>('/governance/forum', {
    fallback: { forum: '', threads: [] }
  }).catch(() => ({ forum: '', threads: [] }));
  return { proposals, votes, queue, delegations, snapshot, forum };
}

export default async function GovernancePage() {
  const { proposals, votes, queue, delegations, snapshot, forum } = await loadGovernance();
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
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Snapshot</div>
          <div className="muted" style={{ marginBottom: 6 }}>
            Space: {snapshot.space}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {snapshot.proposals.map((p) => (
              <a key={p.id} href={p.link} target="_blank" rel="noreferrer" className="pill secondary">
                {p.title} · {p.status}
              </a>
            ))}
            {!snapshot.proposals.length && <div className="muted">No snapshot proposals</div>}
          </div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Forum</div>
          <div className="stack" style={{ gap: 4 }}>
            {forum.threads.map((t) => (
              <a key={t.id} href={t.url} target="_blank" rel="noreferrer" className="row" style={{ justifyContent: 'space-between' }}>
                <span>{t.title}</span>
                <span className="muted">{t.replies} replies</span>
              </a>
            ))}
            {!forum.threads.length && <div className="muted">No forum threads</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
