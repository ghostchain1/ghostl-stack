'use client';

type Tag = { label: string; type: 'wallet' | 'contract' | 'org' };

export function EntityView({ address, tags }: { address: string; tags: Tag[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Entity</div>
      <div className="mono">{address}</div>
      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {tags.map((t) => (
          <div key={t.label} className="badge">
            {t.type}: {t.label}
          </div>
        ))}
        {!tags.length && <div className="muted">No tags yet.</div>}
      </div>
    </div>
  );
}
