'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../src/lib/api';
import { resolveApiBase } from '../../src/lib/runtime';
import { jsonWithCsrf } from '../../src/lib/csrf';

type ComplianceFinding = { id: string; area: string; severity: string; detail: string };
type ComplianceReport = { id: string; period: string; status: string; generatedAt: string; controls?: string[]; findings?: ComplianceFinding[]; exportedAt?: string };
type ActionLog = { actor: string; action: string; resource: string; createdAt: string };

export default function CompliancePage() {
  const API_URL = resolveApiBase();
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [period, setPeriod] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiFetch<{ reports: ComplianceReport[] }>('/compliance/reports', { fallback: { reports: [] } })
      .then((res) => setReports(res.reports || []))
      .catch(() => undefined);
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
              <div key={r.id} className="stack" style={{ gap: 6, border: '1px solid var(--border)', padding: 8, borderRadius: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div>{r.period}</div>
                    <div className="muted">{r.generatedAt}</div>
                  </div>
                  <div className="badge">{r.status}</div>
                </div>
                {r.controls?.length ? <div className="muted">Controls: {r.controls.join(', ')}</div> : null}
                {r.findings?.length ? (
                  <div className="stack" style={{ gap: 4 }}>
                    {r.findings.map((f) => (
                      <div key={f.id} className={`pill ${f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : ''}`}>
                        {f.area}: {f.detail}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <a href={`${API_URL}/compliance/reports/${r.id}`} className="button secondary" target="_blank" rel="noreferrer">
                    View JSON
                  </a>
                  <a
                    href={`${API_URL}/compliance/reports/${r.id}/export?format=csv`}
                    className="button secondary"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Export CSV
                  </a>
                </div>
                {r.exportedAt && <div className="muted">Last exported: {r.exportedAt}</div>}
              </div>
            ))}
            {!reports.length && <div className="muted">No reports</div>}
            <div className="row" style={{ gap: 6 }}>
              <input
                type="text"
                placeholder="Period (e.g., Q2)"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                style={{ flex: 1, padding: '6px 8px' }}
              />
              <button
                onClick={async () => {
                  setMessage('');
                  try {
                    const res = await fetch(`${API_URL}/compliance/reports`, {
                      method: 'POST',
                      headers: jsonWithCsrf(),
                      credentials: 'include',
                      body: JSON.stringify({ period })
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setMessage(json.error || `HTTP ${res.status}`);
                    } else {
                      setMessage('Report generated');
                      setPeriod('');
                      setReports((prev) => [...prev, json.report]);
                    }
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Generate
              </button>
            </div>
            {message && <div className="muted">{message}</div>}
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
