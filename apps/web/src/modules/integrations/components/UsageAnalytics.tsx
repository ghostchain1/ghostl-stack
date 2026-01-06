'use client';

type UsageStat = { id: string; requests: number; errors: number; p95: number };

export function UsageAnalytics({ stats }: { stats: UsageStat[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Usage analytics</div>
      <div className="stack" style={{ gap: 6 }}>
        {stats.map((s) => (
          <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>{s.id}</div>
            <div className="pill">
              {s.requests} req · {s.errors} errors · p95 {s.p95} ms
            </div>
          </div>
        ))}
        {!stats.length && <div className="muted">No usage data.</div>}
      </div>
    </div>
  );
}
