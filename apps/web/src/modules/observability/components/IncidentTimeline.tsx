'use client';

type Incident = {
  id?: string;
  source: string;
  message?: string;
  severity?: string;
  createdAt?: string;
  time?: string;
};

const severityClass = (s?: string) => {
  if (s === 'critical' || s === 'error') return 'badge bad';
  if (s === 'warning') return 'badge warn';
  return 'badge muted';
};

export function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Incidents</div>
      <div className="stack" style={{ gap: 6 }}>
        {incidents.map((i, idx) => (
          <div key={i.id || idx} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{i.message || 'incident'}</div>
              <div className="muted">
                {i.source} · {i.time || i.createdAt || 'unknown'}
              </div>
            </div>
            <div className={severityClass(i.severity)}>{i.severity || 'info'}</div>
          </div>
        ))}
        {!incidents.length && <div className="muted">No recent incidents</div>}
      </div>
    </div>
  );
}
