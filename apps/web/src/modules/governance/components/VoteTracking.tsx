'use client';

import type { Proposal, Vote } from '@ghostchain/types/governance';

export function VoteTracking({ proposal, votes }: { proposal: Proposal; votes: Vote[] }) {
  const quorumMet = votes.reduce((sum, v) => sum + v.weight, 0) >= proposal.quorum;
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Vote tracking</div>
      <div className="pill">
        Quorum {proposal.quorum} · For {proposal.votesFor} / Against {proposal.votesAgainst} ·{' '}
        {quorumMet ? 'Quorum met' : 'Quorum pending'}
      </div>
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        {votes.map((v) => (
          <div key={v.voter + v.choice} className="row" style={{ justifyContent: 'space-between' }}>
            <div className="mono">{v.voter}</div>
            <div className="badge">{v.choice}</div>
            <div className="muted">{v.weight}</div>
          </div>
        ))}
        {!votes.length && <div className="muted">No votes yet.</div>}
      </div>
    </div>
  );
}
