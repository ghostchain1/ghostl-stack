'use client';

import type { Proposal } from '@ghostl/types/governance';

export function ProposalsList({ proposals }: { proposals: Proposal[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Proposals</div>
      <div className="stack" style={{ gap: 6 }}>
        {proposals.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{p.title}</div>
              <div className="muted">
                Quorum {p.quorum} · For {p.votesFor} / Against {p.votesAgainst}
              </div>
            </div>
            <div className="badge">{p.status}</div>
          </div>
        ))}
        {!proposals.length && <div className="muted">No proposals.</div>}
      </div>
    </div>
  );
}
