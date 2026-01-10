'use client';

import { useEffect, useState } from 'react';

type Proposal = {
  id: string;
  approvals?: string[];
  createdAt?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function TreasuryApprovals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/api/treasury/proposals`, { credentials: 'include' });
      const json = await res.json();
      setProposals(json.proposals || []);
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
      const res = await fetch(`${API_BASE}/v1/api/treasury/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: id, signer: 'ui' })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || `Approval failed ${res.status}`);
      } else {
        setMessage('Approved');
        await load();
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Treasury approvals</div>
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
