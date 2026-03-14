'use client';

type Bridge = { id: string; src: string; dst: string; status: string };

export function BridgesOverview({ bridges, summary }: { bridges: Bridge[]; summary?: { pending?: number; finalized?: number; signaturesMissing?: number } }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Bridges</div>
      {summary && (
        <div className="pill" style={{ marginBottom: 6 }}>
          Pending {summary.pending ?? 0} · Finalized {summary.finalized ?? 0} · Missing sigs {summary.signaturesMissing ?? 0}
        </div>
      )}
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
