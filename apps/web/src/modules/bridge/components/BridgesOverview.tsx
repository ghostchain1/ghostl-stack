'use client';

type Bridge = { id: string; src: string; dst: string; status: string };

export function BridgesOverview({ bridges }: { bridges: Bridge[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Bridges</div>
      <div className="stack" style={{ gap: 6 }}>
        {bridges.map((b) => (
          <div key={b.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{b.id}</div>
              <div className="muted">
                {b.src} → {b.dst}
              </div>
            </div>
            <div className="badge">{b.status}</div>
          </div>
        ))}
        {!bridges.length && <div className="muted">No bridges configured.</div>}
      </div>
    </div>
  );
}
