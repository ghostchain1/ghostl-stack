'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ApiError } from '../../../../src/lib/api';
import { DataFetchErrorCard } from '../../../../src/components/DataFetchErrorCard';
import { hgopRequest } from '../../../../src/modules/hyperghost/hgopApi';

type IncidentRow = {
  incident_id: string;
  ts: number;
  env: string;
  scope: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  title: string;
  status: 'open' | 'mitigated' | 'resolved' | 'false_positive';
};

type IncidentsResponse = { ok: boolean; incidents: IncidentRow[] };

export default function HyperghostIncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [status, setStatus] = useState<string>('open');
  const [severity, setSeverity] = useState<string>('');
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);
  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (severity) params.set('severity', severity);
    const s = params.toString();
    return s ? `?${s}` : '';
  }, [status, severity]);

  useEffect(() => {
    const load = async () => {
      const res = await hgopRequest<IncidentsResponse>(`/incidents${qs}`);
      if (!res.ok) {
        setErrors([{ title: 'HGOP incidents', error: res.error }]);
        return;
      }
      setErrors([]);
      setIncidents(res.data.incidents || []);
    };
    load().catch(() => undefined);
  }, [qs]);

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Incidents</div>
          <div className="muted">HGOP incident log (SQLite)</div>
        </div>
        <div className="inline-form" style={{ gap: 8 }}>
          <Link className="button secondary" href="/ai/hyperghost">
            Overview
          </Link>
          <Link className="button secondary" href="/ai/hyperghost/proposals">
            Proposals
          </Link>
        </div>
      </div>

      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="inline-form" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label className="muted">
              Status{' '}
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">any</option>
                <option value="open">open</option>
                <option value="mitigated">mitigated</option>
                <option value="resolved">resolved</option>
                <option value="false_positive">false_positive</option>
              </select>
            </label>
            <label className="muted">
              Severity{' '}
              <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">any</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
                <option value="P4">P4</option>
              </select>
            </label>
            <button className="button secondary" type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          {!incidents.length ? (
            <div className="muted">No incidents found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th align="left">ID</th>
                    <th align="left">Scope</th>
                    <th align="left">Severity</th>
                    <th align="left">Status</th>
                    <th align="left">Title</th>
                    <th align="right">TS</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((i) => (
                    <tr key={i.incident_id}>
                      <td>
                        <Link href={`/ai/hyperghost/incidents/${i.incident_id}`}>{i.incident_id}</Link>
                      </td>
                      <td>{i.scope}</td>
                      <td>{i.severity}</td>
                      <td>{i.status}</td>
                      <td>{i.title}</td>
                      <td align="right" className="muted">
                        {new Date(i.ts * 1000).toISOString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

