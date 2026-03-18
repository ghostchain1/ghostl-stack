'use client';

import { useEffect, useState } from 'react';

type ChainData = { status: 'ok' | 'degraded' | 'unknown'; chainId?: number; blockNumber?: number };

const CARD: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '20px 22px',
};

const CHAINS = [
  { id: 'l1', label: 'GhostChain L1', chainId: 14000101, rpc: 'L1_RPC', port: 18545 },
  { id: 'l2', label: 'GhostL2',       chainId: 901,      rpc: 'L2_RPC', port: 29547 },
  { id: 'l3', label: 'GhostL3',       chainId: 903,      rpc: 'L3_RPC', port: 39545 },
];

export function ChainsPage() {
  const [data, setData] = useState<Record<string, ChainData>>({});

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const results = await Promise.all(
        CHAINS.map(async (c) => {
          try {
            const res = await fetch(`/api/command-center/chain-health?chain=${c.id}`, { cache: 'no-store' });
            const json = await res.json() as ChainData;
            return [c.id, json] as const;
          } catch {
            return [c.id, { status: 'degraded' as const }] as const;
          }
        })
      );
      if (!cancelled) setData(Object.fromEntries(results));
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Chain Management</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          GhostChain L1 · GhostL2 · GhostL3 — live block data and health
        </p>
      </div>

      {/* Chain cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
        {CHAINS.map((c) => {
          const d = data[c.id];
          const ok = d?.status === 'ok';
          return (
            <div key={c.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>chain ID: {c.chainId}</div>
                </div>
                <span style={{
                  fontSize: 10, padding: '3px 9px', borderRadius: 99, fontWeight: 600,
                  background: ok ? 'rgba(34,197,94,0.12)' : d?.status === 'degraded' ? 'rgba(239,68,68,0.12)' : 'rgba(107,114,128,0.12)',
                  color: ok ? '#22c55e' : d?.status === 'degraded' ? '#ef4444' : '#6b7280',
                }}>
                  {d?.status?.toUpperCase() ?? 'LOADING'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Block Height', value: d?.blockNumber !== undefined ? `#${d.blockNumber.toLocaleString()}` : '—' },
                  { label: 'RPC Port',     value: `:${c.port}` },
                  { label: 'Chain ID',     value: String(c.chainId) },
                  { label: 'Gas Token',    value: 'GST' },
                ].map((row) => (
                  <div key={row.label}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{row.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>{row.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <a
                  href={`/explorer`}
                  style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', color: 'var(--muted)',
                    textDecoration: 'none',
                  }}
                >
                  Explorer
                </a>
                <a
                  href={`/chains/${c.id}`}
                  style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 8,
                    background: 'rgba(35,214,166,0.08)', border: '1px solid rgba(35,214,166,0.18)',
                    color: 'var(--accent)', textDecoration: 'none',
                  }}
                >
                  Chain Details →
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bridge status */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Canonical Bridge Addresses</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'L2L3Bridge',       addr: '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2' },
            { label: 'L1 Rollup (L2)',   addr: '0xad32D5C2Da9f4159C4cc98686C005852b3905355' },
            { label: 'L2 Rollup (L3)',   addr: '0x130A46b6E41DB6E1e18fb9c759F223c459190e90' },
            { label: 'Finality Oracle L1', addr: '0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422' },
            { label: 'Finality Oracle L2', addr: '0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A' },
            { label: 'Finality Oracle L3', addr: '0x87F850cbC2cFfac086F20d0d7307E12d06fA2127' },
          ].map((row) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
              <div style={{ width: 150, color: 'var(--muted)', flexShrink: 0 }}>{row.label}</div>
              <div style={{ fontFamily: 'monospace', color: 'var(--text)', fontSize: 11 }}>{row.addr}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
