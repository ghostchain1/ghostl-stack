'use client';

type Policy = { id: string; title: string; description?: string; status?: 'allow' | 'delay' | 'pause' };

export function PolicyViewer({ policies }: { policies: Policy[] }) {
  if (!policies.length) return <div className="muted">No policies loaded.</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {policies.map((p) => (
        <div key={p.id} className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{p.title}</div>
              <div className="muted">{p.description || p.id}</div>
            </div>
            <div className="badge">{p.status || 'allow'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
