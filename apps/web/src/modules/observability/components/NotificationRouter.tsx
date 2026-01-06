'use client';

type Route = { target: string; channel: 'slack' | 'discord' | 'webhook' | 'email'; active: boolean };

export function NotificationRouter({ routes }: { routes: Route[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Notification routing</div>
      <div className="stack" style={{ gap: 6 }}>
        {routes.map((r) => (
          <div key={`${r.channel}-${r.target}`} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{r.channel}</div>
              <div className="muted">{r.target}</div>
            </div>
            <div className={`badge ${r.active ? 'ok' : 'warn'}`}>{r.active ? 'active' : 'inactive'}</div>
          </div>
        ))}
        {!routes.length && <div className="muted">No routes configured.</div>}
      </div>
    </div>
  );
}
