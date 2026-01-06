'use client';

type Profile = { address: string; label?: string; score: number; notes?: string };

export function WalletBehaviorProfiles({ profiles }: { profiles: Profile[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Wallet behavior</div>
      <div className="stack" style={{ gap: 6 }}>
        {profiles.map((p) => (
          <div key={p.address} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="mono">{p.address}</div>
              <div className="muted">{p.label || p.notes || '—'}</div>
            </div>
            <div className={`badge ${p.score >= 80 ? 'bad' : p.score >= 50 ? 'warn' : 'ok'}`}>{p.score}</div>
          </div>
        ))}
        {!profiles.length && <div className="muted">No profiles.</div>}
      </div>
    </div>
  );
}
