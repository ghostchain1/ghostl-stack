'use client';

import { useEffect, useState } from 'react';

type ChainStatus = {
  id: string;
  label: string;
  chainId: number;
  rpc: string;
  status: 'ok' | 'degraded' | 'unknown';
  blockNumber?: number;
  chainIdHex?: string;
};

const CHAINS: ChainStatus[] = [
  { id: 'l1', label: 'GhostChain L1', chainId: 14000101, rpc: '/api/command-center/chain-health?chain=l1', status: 'unknown' },
  { id: 'l2', label: 'GhostL2',       chainId: 901,      rpc: '/api/command-center/chain-health?chain=l2', status: 'unknown' },
  { id: 'l3', label: 'GhostL3',       chainId: 903,      rpc: '/api/command-center/chain-health?chain=l3', status: 'unknown' },
];

export function ChainHealthRow() {
  const [chains, setChains] = useState<ChainStatus[]>(CHAINS);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      const results = await Promise.all(
        CHAINS.map(async (c) => {
          try {
            const res = await fetch(c.rpc, { cache: 'no-store' });
            if (!res.ok) return { ...c, status: 'degraded' as const };
            const json = await res.json() as { blockNumber?: number; status?: string };
            return {
              ...c,
              status: (json.status === 'ok' ? 'ok' : 'degraded') as ChainStatus['status'],
              blockNumber: json.blockNumber,
            };
          } catch {
            return { ...c, status: 'degraded' as const };
          }
        })
      );
      if (!cancelled) setChains(results);
    }
    void probe();
    const interval = setInterval(() => { void probe(); }, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {chains.map((c) => (
        <div
          key={c.id}
          className="card"
          style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot status={c.status} />
            <span className="muted" style={{ fontSize: 12 }}>
              chain {c.chainId}
            </span>
          </div>
          {c.blockNumber !== undefined && (
            <div className="muted" style={{ fontSize: 12 }}>block #{c.blockNumber.toLocaleString()}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: ChainStatus['status'] }) {
  const colour = status === 'ok' ? '#22c55e' : status === 'degraded' ? '#f59e0b' : '#6b7280';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8, height: 8,
        borderRadius: '50%',
        background: colour,
        flexShrink: 0,
      }}
    />
  );
}
