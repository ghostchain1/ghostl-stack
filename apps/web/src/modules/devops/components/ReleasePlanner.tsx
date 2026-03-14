'use client';

import type { Release } from '@ghostl/types/devops';

export function ReleasePlanner({ releases }: { releases: Release[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Release planner</div>
      <div className="stack" style={{ gap: 6 }}>
        {releases.map((r) => (
          <div key={r.version} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{r.version}</div>
              <div className="muted">{r.components.join(', ')}</div>
            </div>
            <div className={`badge ${r.status === 'running' ? 'warn' : r.status === 'completed' ? 'ok' : 'secondary'}`}>{r.status}</div>
          </div>
        ))}
        {!releases.length && <div className="muted">No releases planned.</div>}
      </div>
    </div>
  );
}
