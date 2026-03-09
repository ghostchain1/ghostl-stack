'use client';

import { useEffect, useState } from 'react';

type NodeEntry = {
  name: string;
  layer: 'L1' | 'L2' | 'L3';
  chainId: number;
  rpc: string;
  status: 'online' | 'offline' | 'syncing';
  blockNumber?: number;
};

type ApiResponse = {
  nodes: Array<{
    name: string;
    layer: string;
    chainId: number;
    rpc: string;
    status: string;
    blockNumber?: number;
  }>;
};

const STATUS_COLOUR: Record<NodeEntry['status'], string> = {
  online:  '#22c55e',
  syncing: '#f59e0b',
  offline: '#ef4444',
};

export function NodeStatus() {
  const [nodes, setNodes] = useState<NodeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/nodes', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as ApiResponse;
        if (!cancelled) {
          setNodes(json.nodes as NodeEntry[]);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const onlineCount = nodes.filter((n) => n.status === 'online').length;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700 }}>GhostChain Nodes</span>
        {nodes.length > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>{onlineCount}/{nodes.length} online</span>
        )}
      </div>

      {error && (
        <div className="badge bad" style={{ fontSize: 12 }}>Node API offline — {error}</div>
      )}

      {!error && nodes.length === 0 && (
        <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {nodes.map((n) => (
          <div
            key={n.name}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-block', width: 7, height: 7,
                  borderRadius: '50%', background: STATUS_COLOUR[n.status] ?? '#6b7280',
                  flexShrink: 0,
                }}
              />
              <span>{n.name}</span>
              <span className="muted" style={{ fontSize: 11 }}>{n.layer}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {n.blockNumber !== undefined && (
                <span className="muted" style={{ fontSize: 11 }}>#{n.blockNumber.toLocaleString()}</span>
              )}
              <span
                style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 99,
                  background: n.status === 'online' ? '#dcfce7' : n.status === 'syncing' ? '#fef9c3' : '#fee2e2',
                  color: n.status === 'online' ? '#166534' : n.status === 'syncing' ? '#854d0e' : '#991b1b',
                  fontWeight: 600,
                }}
              >
                {n.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {lastUpdated && (
        <div className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
          Updated {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
