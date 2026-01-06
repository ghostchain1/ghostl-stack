'use client';

type Partner = { name: string; type: 'exchange' | 'oracle' | 'indexer' | 'other'; status: string };

export function PartnerIntegrations({ partners }: { partners: Partner[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Partners</div>
      <div className="stack" style={{ gap: 6 }}>
        {partners.map((p) => (
          <div key={p.name} className="row" style={{ justifyContent: 'space-between' }}>
            <div>{p.name}</div>
            <div className="badge">{p.status}</div>
          </div>
        ))}
        {!partners.length && <div className="muted">No partners configured.</div>}
      </div>
    </div>
  );
}
