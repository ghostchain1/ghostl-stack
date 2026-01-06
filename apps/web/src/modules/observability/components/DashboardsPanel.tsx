'use client';

type Dashboard = { name: string; url: string };

export function DashboardsPanel({ dashboards }: { dashboards: Dashboard[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Dashboards</div>
      <div className="stack" style={{ gap: 6 }}>
        {dashboards.map((d) => (
          <div key={d.name} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>{d.name}</div>
            <a className="button secondary" href={d.url} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        ))}
        {!dashboards.length && <div className="muted">No dashboards configured.</div>}
      </div>
    </div>
  );
}
