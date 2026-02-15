'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ApiError } from '../../../../../src/lib/api';
import { DataFetchErrorCard } from '../../../../../src/components/DataFetchErrorCard';
import { hgopRequest } from '../../../../../src/modules/hyperghost/hgopApi';

type IncidentRow = {
  incident_id: string;
  ts: number;
  env: string;
  scope: string;
  severity: string;
  title: string;
  status: string;
  symptoms_json: unknown;
  hypotheses_json: unknown;
  evidence_refs_json: unknown;
};

type EvidenceRow = {
  evidence_id: string;
  kind: string;
  uri: string;
  sha256?: string | null;
  created_ts: number;
};

type IncidentDetailResponse = { ok: boolean; incident: IncidentRow; evidence: EvidenceRow[] };

export default function HyperghostIncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String((params as any)?.id || '');
  const [data, setData] = useState<IncidentDetailResponse | null>(null);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await hgopRequest<IncidentDetailResponse>(`/incidents/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setErrors([{ title: 'HGOP incident', error: res.error }]);
        return;
      }
      setErrors([]);
      setData(res.data);
    };
    if (id) load().catch(() => undefined);
  }, [id]);

  return (
    <div className="content">
      <div className="spread" style={{ alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Incident</div>
          <div className="muted">{id}</div>
        </div>
        <div className="inline-form" style={{ gap: 8 }}>
          <Link className="button secondary" href="/ai/hyperghost/incidents">
            Back
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
        {actionError && <DataFetchErrorCard title="Action" error={actionError} />}

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          {!data ? (
            <div className="muted">Loading...</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="spread">
                <span className="muted">Scope</span>
                <strong>{data.incident.scope}</strong>
              </div>
              <div className="spread">
                <span className="muted">Severity</span>
                <strong>{data.incident.severity}</strong>
              </div>
              <div className="spread">
                <span className="muted">Status</span>
                <strong>{data.incident.status}</strong>
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  Title
                </div>
                <div style={{ fontWeight: 700 }}>{data.incident.title}</div>
              </div>
              <div className="spread">
                <span className="muted">Timestamp</span>
                <strong>{new Date(data.incident.ts * 1000).toISOString()}</strong>
              </div>
              <div className="inline-form" style={{ gap: 8, marginTop: 6 }}>
                <button
                  className="button"
                  type="button"
                  disabled={busy || !data}
                  onClick={async () => {
                    if (!data) return;
                    setBusy(true);
                    setActionError(null);
                    const res = await hgopRequest<{ ok: boolean; proposal: { proposal_id: string } }>(`/proposals/generate`, {
                      init: {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ incidentId: data.incident.incident_id })
                      }
                    });
                    setBusy(false);
                    if (!res.ok) {
                      setActionError(res.error);
                      return;
                    }
                    const propId = res.data.proposal?.proposal_id;
                    if (propId) router.push(`/ai/hyperghost/proposals/${propId}`);
                  }}
                >
                  {busy ? 'Generating...' : 'Generate Proposal'}
                </button>
                <Link className="button secondary" href="/ai/hyperghost/health">
                  Supervisor Health
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Evidence</div>
          {!data ? (
            <div className="muted">Loading...</div>
          ) : data.evidence?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th align="left">ID</th>
                    <th align="left">Kind</th>
                    <th align="left">URI</th>
                    <th align="left">SHA</th>
                    <th align="right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.evidence.map((e) => (
                    <tr key={e.evidence_id}>
                      <td>{e.evidence_id}</td>
                      <td>{e.kind}</td>
                      <td className="muted">{e.uri}</td>
                      <td className="muted">{e.sha256 || ''}</td>
                      <td align="right" className="muted">
                        {new Date(e.created_ts * 1000).toISOString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">No evidence attached.</div>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Raw</div>
          {!data ? (
            <div className="muted">Loading...</div>
          ) : (
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(data.incident, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

