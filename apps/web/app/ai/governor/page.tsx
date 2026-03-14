'use client';

import { useEffect, useState } from 'react';

type ProposalSummary = {
  proposalId: string;
  createdAt: string;
  summary: {
    strategyCount: number;
    violations: number;
    topStrategyId: string | null;
    policyVersion: string;
  };
};

export default function HyperGhostGovernorPage() {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/governor/proposals', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || `http_${response.status}`);
      }
      setProposals(Array.isArray(body?.proposals) ? body.proposals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  };

  const draft = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/governor/proposals/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          volatilityBand: 'medium',
          policyVersion: 'federation-v1',
          riskCapBps: 7200,
          maxProtocolConcentrationBps: 4500
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || `http_${response.status}`);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'draft_failed');
      setLoading(false);
    }
  };

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  return (
    <div className="content">
      <div className="card-grid">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="spread" style={{ alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>Hyper Ghost AI Treasury Governor</h2>
              <div className="muted">Draft-only deterministic strategy ranking. Governance still executes.</div>
            </div>
            <button className="button" onClick={draft} disabled={loading}>
              Draft Proposal
            </button>
          </div>
          {error ? <div className="muted" style={{ marginTop: 8, color: '#dc3545' }}>{error}</div> : null}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Drafted Proposals</h3>
          {loading ? <div className="muted">Loading...</div> : null}
          {!loading && proposals.length === 0 ? <div className="muted">No proposals drafted yet.</div> : null}
          {!loading && proposals.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th align="left">Proposal</th>
                    <th align="left">Created</th>
                    <th align="right">Strategies</th>
                    <th align="right">Violations</th>
                    <th align="left">Top Strategy</th>
                    <th align="left">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((proposal) => (
                    <tr key={proposal.proposalId}>
                      <td>{proposal.proposalId}</td>
                      <td>{proposal.createdAt}</td>
                      <td align="right">{proposal.summary?.strategyCount ?? 0}</td>
                      <td align="right">{proposal.summary?.violations ?? 0}</td>
                      <td>{proposal.summary?.topStrategyId || 'n/a'}</td>
                      <td>
                        <a href={`/api/governor/proposals/${proposal.proposalId}/evidence`} target="_blank" rel="noreferrer">
                          view
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
