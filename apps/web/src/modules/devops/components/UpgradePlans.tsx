'use client';

import { useEffect, useState } from 'react';

type Step = {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'done';
  notes?: string;
};

type Plan = {
  id: string;
  name: string;
  steps: Step[];
  approvals: string[];
  createdAt: string;
  updatedAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function UpgradePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/devops/upgrade-plans`, { credentials: 'include' });
      const json = await res.json();
      setPlans(json.plans || []);
    } catch {
      setMessage('Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const act = async (planId: string, action: 'approve' | 'dryrun' | 'execute') => {
    setMessage('');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (action !== 'approve') {
      headers['x-execution-approve'] = 'yes';
      if (token) headers['x-execution-token'] = token;
    }
    const url =
      action === 'approve'
        ? `${API_BASE}/v1/devops/upgrade-plans/${planId}/approve`
        : `${API_BASE}/v1/devops/upgrade-plans/${planId}/execute${action === 'dryrun' ? '?dryRun=1' : ''}`;
    try {
      const res = await fetch(url, { method: 'POST', headers, credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(`Action failed: ${json.error || res.status}`);
      } else {
        setMessage(`${action} ok`);
        await load();
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Upgrade plans</div>
      <div className="muted" style={{ marginBottom: 8 }}>
        Approvals require two unique users; execution requires approval header + token.
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Execution token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ flex: 1, padding: '6px 8px' }}
        />
        <button onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>
      {message && <div className="muted" style={{ marginBottom: 8 }}>{message}</div>}
      <div className="stack" style={{ gap: 8 }}>
        {plans.map((p) => (
          <div key={p.id} className="card" style={{ background: '#0c0d10', border: '1px solid #1c1d22' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="muted">Approvals: {p.approvals.length}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button onClick={() => act(p.id, 'approve')}>Approve</button>
                <button onClick={() => act(p.id, 'dryrun')}>Dry run</button>
                <button onClick={() => act(p.id, 'execute')}>Execute</button>
              </div>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              {p.steps.map((s) => (
                <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div>{s.name}</div>
                    <div className="muted">{s.notes || 'pending'}</div>
                  </div>
                  <div className={`badge ${s.status === 'done' ? 'ok' : s.status === 'in_progress' ? 'warn' : 'muted'}`}>
                    {s.status}
                  </div>
                </div>
              ))}
              {!p.steps.length && <div className="muted">No steps</div>}
            </div>
          </div>
        ))}
        {!plans.length && <div className="muted">No upgrade plans</div>}
      </div>
    </div>
  );
}
