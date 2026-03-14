'use client';

import { useEffect, useState } from 'react';

type NodeEntry = { name: string; layer: string; chainId: number; status: string; blockNumber?: number };
type NodesResponse = { nodes: NodeEntry[] };

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

const TABLE_ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '140px 60px 120px 140px 1fr 120px',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  fontSize: 13,
  borderBottom: '1px solid var(--border)',
};

export function NodesPage() {
  const [data, setData] = useState<NodesResponse | null>(null);
  const [actionState, setActionState] = useState<Record<string, 'idle' | 'pending' | 'ok' | 'error'>>({});

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/nodes', { cache: 'no-store' });
        const json = await res.json() as NodesResponse;
        if (!cancelled) setData(json);
      } catch { /* swallow */ }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function sendProposal(name: string, action: string) {
    setActionState((p) => ({ ...p, [name]: 'pending' }));
    try {
      const res = await fetch('/api/portal/nodes/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action }),
      });
      setActionState((p) => ({ ...p, [name]: res.ok ? 'ok' : 'error' }));
    } catch {
      setActionState((p) => ({ ...p, [name]: 'error' }));
    }
    setTimeout(() => setActionState((p) => ({ ...p, [name]: 'idle' })), 3_000);
  }

  const nodes = data?.nodes ?? [];
  const online = nodes.filter((n) => n.status === 'online').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Node Management</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            GhostChain L1 · L2 · L3 nodes — status, block height, restart proposals
          </p>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{online}</span>/{nodes.length} online
        </div>
      </div>

      <div style={CARD}>
        {/* Header */}
        <div style={{ ...TABLE_ROW, borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          <span>Node</span><span>Layer</span><span>Chain ID</span><span>Block</span><span>Status</span><span>Action</span>
        </div>

        {nodes.length === 0 && (
          <div style={{ padding: '24px 12px', color: 'var(--muted)', fontSize: 13 }}>Loading nodes…</div>
        )}

        {nodes.map((n) => {
          const st = actionState[n.name] ?? 'idle';
          return (
            <div key={n.name} style={TABLE_ROW}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{n.name}</span>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, textAlign: 'center',
                background: n.layer === 'L1' ? 'rgba(122,162,255,0.12)' : n.layer === 'L2' ? 'rgba(35,214,166,0.12)' : 'rgba(242,193,78,0.12)',
                color: n.layer === 'L1' ? '#7aa2ff' : n.layer === 'L2' ? '#23d6a6' : '#f2c14e',
              }}>{n.layer}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{n.chainId}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {n.blockNumber !== undefined ? `#${n.blockNumber.toLocaleString()}` : '—'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
                  background: n.status === 'online' ? '#22c55e' : '#ef4444',
                }} />
                <span style={{ fontSize: 12, color: n.status === 'online' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {n.status}
                </span>
              </div>
              <button
                onClick={() => { void sendProposal(n.name, 'restart'); }}
                disabled={st === 'pending'}
                style={{
                  fontSize: 11, padding: '5px 12px', borderRadius: 8, cursor: st === 'pending' ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border)',
                  background: st === 'ok' ? 'rgba(34,197,94,0.1)' : st === 'error' ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: st === 'ok' ? '#22c55e' : st === 'error' ? '#ef4444' : 'var(--muted)',
                }}
              >
                {st === 'pending' ? 'Sending…' : st === 'ok' ? 'Proposed ✓' : st === 'error' ? 'Failed' : 'Restart'}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ ...CARD, fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--warning)', fontSize: 14 }}>ⓘ</span>
        Node restart actions are sent as governance proposals to the signing relay for human ratification. 
        No direct execution occurs without quorum approval.
      </div>
    </div>
  );
}
