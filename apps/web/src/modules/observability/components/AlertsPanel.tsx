'use client';

import type { Alert } from '@ghostl/types/observability';

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const tone = (severity: Alert['severity']) => {
    if (severity === 'critical') return 'bad';
    if (severity === 'warning') return 'warn';
    return 'ok';
  };
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Alerts & routing</div>
      <div className="stack" style={{ gap: 6 }}>
        {alerts.map((a) => (
          <div key={a.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{a.source}</div>
              <div className="muted">
                {a.state} · {a.firedAt}
              </div>
            </div>
            <div className={`badge ${tone(a.severity)}`}>{a.severity}</div>
          </div>
        ))}
        {!alerts.length && <div className="muted">No alerts.</div>}
      </div>
    </div>
  );
}
