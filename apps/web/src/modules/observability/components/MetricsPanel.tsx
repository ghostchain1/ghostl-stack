'use client';

type MetricTarget = { name: string; url: string };

export function MetricsPanel({ targets }: { targets: MetricTarget[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Metrics (Prometheus)</div>
      <div className="stack" style={{ gap: 6 }}>
        {targets.map((t) => (
          <div key={t.name} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>{t.name}</div>
            <a className="button secondary" href={t.url} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        ))}
        {!targets.length && <div className="muted">No Prometheus targets configured.</div>}
      </div>
    </div>
  );
}
