'use client';

import type { LogEvent } from '@ghostl/types/observability';

export function LogsViewer({ events }: { events: LogEvent[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Logs</div>
      <div className="stack" style={{ gap: 6, maxHeight: 260, overflow: 'auto' }}>
        {events.map((e, idx) => (
          <div key={`${e.time}-${idx}`} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="muted">{e.time}</div>
              <div className="muted">
                [{e.level}] {e.source}
              </div>
              <div className="mono">{e.message}</div>
            </div>
            <div className="badge secondary">{Object.keys(e.labels || {}).length || 0} labels</div>
          </div>
        ))}
        {!events.length && <div className="muted">No logs.</div>}
      </div>
    </div>
  );
}
