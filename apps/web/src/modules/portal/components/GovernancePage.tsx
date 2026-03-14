'use client';

import { useEffect, useState } from 'react';

type Proposal = {
  id: string;
  title: string;
  proposer: string;
  status: 'active' | 'passed' | 'rejected' | 'pending' | 'queued';
  votesFor?: number;
  votesAgainst?: number;
  quorum?: number;
  deadline?: string;
  aiGenerated?: boolean;
};

type GovernanceData = { proposals: Proposal[]; quorumReached?: number; totalProposals?: number };

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#3b82f6',
  passed: '#22c55e',
  rejected: '#ef4444',
  pending: '#f59e0b',
  queued: '#8b5cf6',
};

export function GovernancePage() {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'passed' | 'rejected'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/portal/governance', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as GovernanceData;
        if (!cancelled) { setData(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Governance service unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const proposals = (data?.proposals ?? []).filter((p) => filter === 'all' || p.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Governance</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            GhostChainGovernor — active proposals, voting, AI drafts
          </p>
        </div>
        {data && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {data.totalProposals ?? '—'} total · {data.quorumReached ?? '—'} reached quorum
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...CARD, color: 'var(--danger)', fontSize: 13 }}>
          Governance service unreachable — {error}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'active', 'passed', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 12, padding: '5px 14px', borderRadius: 99, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: filter === f ? 'var(--accent)' : 'transparent',
              color: filter === f ? '#fff' : 'var(--muted)',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {proposals.length === 0 && (
        <div style={{ ...CARD, color: 'var(--muted)', fontSize: 13 }}>
          {error ? '' : 'No proposals found.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {proposals.map((p) => {
          const total = (p.votesFor ?? 0) + (p.votesAgainst ?? 0);
          const pctFor = total > 0 ? Math.round(((p.votesFor ?? 0) / total) * 100) : 0;
          return (
            <div key={p.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                      background: `${STATUS_COLORS[p.status] ?? '#666'}22`,
                      color: STATUS_COLORS[p.status] ?? '#666',
                    }}>
                      {p.status.toUpperCase()}
                    </span>
                    {p.aiGenerated && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', fontWeight: 600 }}>
                        GhostBrain Draft
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>#{p.id}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>by {p.proposer}</div>
                </div>
                {p.deadline && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    Deadline<br />{p.deadline}
                  </div>
                )}
              </div>

              {total > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: '#22c55e' }}>For: {p.votesFor?.toLocaleString() ?? 0} GST</span>
                    <span style={{ color: '#ef4444' }}>Against: {p.votesAgainst?.toLocaleString() ?? 0} GST</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: '#ef444444' }}>
                    <div style={{ height: '100%', width: `${pctFor}%`, background: '#22c55e', transition: 'width 0.6s' }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ ...CARD, padding: '14px 18px', borderLeft: '3px solid var(--accent)', fontSize: 12, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Human Ratification Required:</strong> GhostBrain AI may draft proposals. All proposals require governance quorum before on-chain execution. Autonomous execution is blocked by the signing relay.
      </div>
    </div>
  );
}
