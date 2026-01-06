'use client';

type Rollback = { id: string; version: string; reason: string; time: string };

export function RollbackHistory({ rollbacks }: { rollbacks: Rollback[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Rollback history</div>
      <div className="stack" style={{ gap: 6 }}>
        {rollbacks.map((r) => (
          <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{r.version}</div>
              <div className="muted">{r.reason}</div>
            </div>
            <div className="muted">{r.time}</div>
          </div>
        ))}
        {!rollbacks.length && <div className="muted">No rollbacks recorded.</div>}
      </div>
    </div>
  );
}
