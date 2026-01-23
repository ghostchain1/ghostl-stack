'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest, type ApiError, formatApiError } from '../../src/lib/api';
import { resolveApiBase } from '../../src/lib/runtime';
import { jsonWithCsrf } from '../../src/lib/csrf';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';

type ComplianceFinding = { id: string; area: string; severity: string; detail: string };
type ComplianceReport = { id: string; period: string; status: string; generatedAt: string; controls?: string[]; findings?: ComplianceFinding[]; exportedAt?: string };
type ActionLog = { actor: string; action: string; resource: string; createdAt: string };

export default function CompliancePage() {
  const API_URL = resolveApiBase();
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [period, setPeriod] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);

  useEffect(() => {
    const load = async () => {
      const nextErrors: Array<{ title: string; error: ApiError }> = [];
      const reportsRes = await apiRequest<{ reports: ComplianceReport[] }>('/compliance/reports');
      if (!reportsRes.ok) {
        nextErrors.push({ title: 'Compliance reports', error: reportsRes.error });
      } else {
        setReports(reportsRes.data.reports || []);
      }
      const logsRes = await apiRequest<ActionLog[]>('/audit');
      if (!logsRes.ok) {
        nextErrors.push({ title: 'Audit log', error: logsRes.error });
      } else {
        setLogs(logsRes.data || []);
      }
      setErrors(nextErrors);
    };
    load().catch(() => undefined);
  }, []);

  const csv = useMemo(() => {
    if (!logs.length) return '';
    const header = 'actor,action,resource,createdAt';
    const rows = logs.map((l) => `${l.actor},${l.action},${l.resource},${l.createdAt || ''}`);
    return [header, ...rows].join('\n');
  }, [logs]);

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Compliance Console</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="button secondary" href="/compliance/overview">
            Overview
          </Link>
          <Link className="button secondary" href="/compliance/decisions">
            Decisions
          </Link>
          <Link className="button secondary" href="/compliance/policies">
            Policies
          </Link>
          <Link className="button secondary" href="/compliance/laws">
            Laws
          </Link>
          <Link className="button secondary" href="/compliance/predictions">
            Predictions
          </Link>
          <Link className="button secondary" href="/compliance/evidence">
            Evidence
          </Link>
          <Link className="button secondary" href="/compliance/controls">
            Controls
          </Link>
        </div>
      </div>
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
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
                    const res = await apiRequest<{ report: ComplianceReport }>('/compliance/reports', {
                      baseUrl: API_URL,
                      init: {
                        method: 'POST',
                        headers: jsonWithCsrf(),
                        body: JSON.stringify({ period })
                      }
                    });
                    if (!res.ok) {
                      const info = formatApiError(res.error);
                      setMessage(`POST ${info.endpoint} · ${info.status} · ${info.hint}`);
                      return;
                    }
                    setMessage('Report generated');
                    setPeriod('');
                    setReports((prev) => [...prev, res.data.report]);
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
