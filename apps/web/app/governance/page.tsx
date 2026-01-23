import { ProposalsList } from '../../src/modules/governance/components/ProposalsList';
import { VoteTracking } from '../../src/modules/governance/components/VoteTracking';
import { ExecutionQueue } from '../../src/modules/governance/components/ExecutionQueue';
import { DelegationPanel } from '../../src/modules/governance/components/DelegationPanel';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';
import type { ApiError } from '../../src/lib/api';
import type { Proposal, Vote } from '@ghostl/types/governance';

type QueueStatus = 'queued' | 'executed' | 'canceled';
type QueueItem = { id: string; eta: string; action: string; status: QueueStatus };

async function loadGovernance() {
  const [proposalsRes, votesRes, queueRes, delegationsRes, snapshotRes, forumRes] = await Promise.all([
    serverApiRequest<Proposal[]>('/governance/proposals', { init: { cache: 'no-store' } }),
    serverApiRequest<Vote[]>('/governance/votes', { init: { cache: 'no-store' } }),
    serverApiRequest<QueueItem[]>('/governance/queue', { init: { cache: 'no-store' } }),
    serverApiRequest<{ delegator: string; delegate: string; weight: number }[]>('/governance/delegations', {
      init: { cache: 'no-store' }
    }),
    serverApiRequest<{ space: string; proposals: { id: string; title: string; status: string; link: string }[] }>('/governance/snapshot', {
      init: { cache: 'no-store' }
    }),
    serverApiRequest<{ forum: string; threads: { id: string; title: string; url: string; replies: number }[] }>('/governance/forum', {
      init: { cache: 'no-store' }
    })
  ]);
  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!proposalsRes.ok) errors.push({ title: 'Governance proposals', error: proposalsRes.error });
  if (!votesRes.ok) errors.push({ title: 'Governance votes', error: votesRes.error });
  if (!queueRes.ok) errors.push({ title: 'Execution queue', error: queueRes.error });
  if (!delegationsRes.ok) errors.push({ title: 'Delegations', error: delegationsRes.error });
  if (!snapshotRes.ok) errors.push({ title: 'Snapshot feed', error: snapshotRes.error });
  if (!forumRes.ok) errors.push({ title: 'Governance forum', error: forumRes.error });

  const proposals = proposalsRes.ok ? proposalsRes.data : [];
  const votes = votesRes.ok ? votesRes.data : [];
  const queueRaw = queueRes.ok ? queueRes.data : [];
  const queue: QueueItem[] = queueRaw.map((item) => ({
    ...item,
    status: (['queued', 'executed', 'canceled'] as QueueStatus[]).includes(item.status) ? item.status : 'queued'
  }));
  const delegations = delegationsRes.ok ? delegationsRes.data : [];
  const snapshot = snapshotRes.ok ? snapshotRes.data : { space: 'snapshot', proposals: [] };
  const forum = forumRes.ok ? forumRes.data : { forum: '', threads: [] };
  return { proposals, votes, queue, delegations, snapshot, forum, errors };
}

export default async function GovernancePage() {
  const { proposals, votes, queue, delegations, snapshot, forum, errors } = await loadGovernance();
  const proposal = proposals[0] || null;
  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        {errors.find((e) => e.title === 'Governance proposals') ? null : <ProposalsList proposals={proposals} />}
        {errors.find((e) => e.title === 'Governance votes') ? null : <VoteTracking proposal={proposal} votes={votes} />}
        {errors.find((e) => e.title === 'Execution queue') ? null : <ExecutionQueue queue={queue} />}
        {errors.find((e) => e.title === 'Delegations') ? null : <DelegationPanel delegations={delegations} />}
        {errors.find((e) => e.title === 'Snapshot feed') ? null : (
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
        )}
        {errors.find((e) => e.title === 'Governance forum') ? null : (
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
        )}
      </div>
    </div>
  );
}
