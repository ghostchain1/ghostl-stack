'use client';

import { useEffect, useState } from 'react';
import { resolveApiBase } from '../../lib/runtime';
import { jsonWithCsrf } from '../../lib/csrf';
import { apiRequest, type ApiError, formatApiError } from '../../lib/api';
import { DataFetchErrorCard } from '../../components/DataFetchErrorCard';

type Proposal = {
  id: string;
  approvals?: string[];
  createdAt?: string;
};

const API_BASE = resolveApiBase();

export function TreasuryApprovals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ proposals?: Proposal[] }>('/v1/api/treasury/proposals', { baseUrl: API_BASE });
      if (!res.ok) {
        setError(res.error);
        setProposals([]);
        return;
      }
      setProposals(res.data.proposals || []);
    } catch {
      setMessage('Failed to load proposals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const approve = async (id: string) => {
    setMessage('');
    try {
      const res = await apiRequest<{ ok?: boolean }>('/v1/api/treasury/approve', {
        baseUrl: API_BASE,
        init: {
          method: 'POST',
          headers: jsonWithCsrf(),
          body: JSON.stringify({ proposalId: id, signer: 'ui' })
        }
      });
      if (!res.ok) {
        const info = formatApiError(res.error);
        setMessage(`POST ${info.endpoint} · ${info.status} · ${info.hint}`);
        return;
      }
      setMessage('Approved');
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Treasury approvals</div>
      {error && <DataFetchErrorCard title="Treasury proposals" error={error} />}
      {message && <div className="muted" style={{ marginBottom: 6 }}>{message}</div>}
      <div className="stack" style={{ gap: 6 }}>
        {proposals.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{p.id}</div>
              <div className="muted">
                Approvals: {p.approvals?.length || 0} {p.createdAt ? ` · ${p.createdAt}` : ''}
              </div>
            </div>
            <button onClick={() => approve(p.id)} disabled={loading}>
              Approve
            </button>
          </div>
        ))}
        {!proposals.length && <div className="muted">No treasury proposals</div>}
      </div>
    </div>
  );
}
