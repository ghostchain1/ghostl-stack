'use client';

type Flag = { name: string; enabled: boolean; description?: string };

export function FeatureFlagsPanel({ flags }: { flags: Flag[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Feature flags</div>
      <div className="stack" style={{ gap: 6 }}>
        {flags.map((f) => (
          <div key={f.name} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{f.name}</div>
              <div className="muted">{f.description || '—'}</div>
            </div>
            <div className={`badge ${f.enabled ? 'ok' : 'warn'}`}>{f.enabled ? 'enabled' : 'disabled'}</div>
          </div>
        ))}
        {!flags.length && <div className="muted">No flags defined.</div>}
      </div>
    </div>
  );
}
