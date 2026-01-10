'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../src/lib/api';

type ComplianceReport = { id: string; period: string; status: string; generatedAt: string };
type ActionLog = { actor: string; action: string; resource: string; createdAt: string };

export default function CompliancePage() {
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);

  useEffect(() => {
    setReports([{ id: 'r1', period: 'Q1', status: 'draft', generatedAt: new Date().toISOString() }]);
    apiFetch<ActionLog[]>('/audit', { fallback: [] })
      .then((data) => setLogs(data || []))
      .catch(() => undefined);
  }, []);

  const csv = useMemo(() => {
    if (!logs.length) return '';
    const header = 'actor,action,resource,createdAt';
    const rows = logs.map((l) => `${l.actor},${l.action},${l.resource},${l.createdAt || ''}`);
    return [header, ...rows].join('\n');
  }, [logs]);

  return (
    <div className="content">
      <div className="card-grid">
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Compliance reports</div>
          <div className="stack" style={{ gap: 6 }}>
            {reports.map((r) => (
              <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div>{r.period}</div>
                  <div className="muted">{r.generatedAt}</div>
                </div>
                <div className="badge">{r.status}</div>
              </div>
            ))}
            {!reports.length && <div className="muted">No reports</div>}
            {csv && (
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
                download="audit-log.csv"
                className="button"
              >
                Download audit CSV
              </a>
            )}
          </div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Audit trail</div>
          <div className="stack" style={{ gap: 6 }}>
            {logs.map((l, idx) => (
              <div key={idx}>
                <div>{l.actor}</div>
                <div className="muted">
                  {l.action} · {l.resource} · {l.createdAt || ''}
                </div>
              </div>
            ))}
            {!logs.length && <div className="muted">No logs</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
