'use client';

type Dispute = { id: string; layer: string; status: string; evidence?: string };

export function DisputesPanel({ disputes }: { disputes: Dispute[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Disputes & fraud proofs</div>
      <div className="stack" style={{ gap: 6 }}>
        {disputes.map((d) => (
          <div key={d.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{d.id}</div>
              <div className="muted">{d.layer}</div>
              {d.evidence && <div className="muted">{d.evidence}</div>}
            </div>
            <div className={`badge ${d.status === 'open' ? 'warn' : 'ok'}`}>{d.status}</div>
          </div>
        ))}
        {!disputes.length && <div className="muted">No disputes.</div>}
      </div>
    </div>
  );
}
