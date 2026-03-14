'use client';

import type { ForkEvent } from '@ghostl/types/devops';

export function ForkScheduler({ forks }: { forks: ForkEvent[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Hard fork scheduler</div>
      <div className="stack" style={{ gap: 6 }}>
        {forks.map((f) => (
          <div key={f.name} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{f.name}</div>
              <div className="muted">Height {f.activationHeight}</div>
              <div className="muted">Checklist: {f.checklist.join(', ')}</div>
            </div>
            <div className="badge">planned</div>
          </div>
        ))}
        {!forks.length && <div className="muted">No forks scheduled.</div>}
      </div>
    </div>
  );
}
