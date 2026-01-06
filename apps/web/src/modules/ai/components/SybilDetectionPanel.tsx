'use client';

type SybilSignal = { entity: string; label?: string; score: number; factors?: string[] };

export function SybilDetectionPanel({ signals }: { signals: SybilSignal[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Sybil / bot detection</div>
      <div className="stack" style={{ gap: 6 }}>
        {signals.map((s) => (
          <div key={s.entity} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{s.entity}</div>
              <div className="muted">{s.factors?.join('; ') || s.label || '—'}</div>
            </div>
            <div className={`badge ${s.score >= 80 ? 'bad' : s.score >= 50 ? 'warn' : 'ok'}`}>{s.score}</div>
          </div>
        ))}
        {!signals.length && <div className="muted">No sybil alerts.</div>}
      </div>
    </div>
  );
}
