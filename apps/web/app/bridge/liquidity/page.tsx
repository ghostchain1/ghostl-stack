'use client';

/**
 * Cross-Chain Liquidity Monitor — Phase 38
 *
 * Displays TVL across all canonical GhostChain bridge contracts
 * (L2L3Bridge, L1→L2 Rollup, L2→L3 Rollup) plus any GhostBrain
 * pool data.  Read-only — no write actions on this page.
 *
 * Data: /api/bridge/liquidity  (polled every 15 s)
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiquidityPool {
  name:    string;
  address: string;
  chains:  string;
  tvlWei:  string | null;
  tvlGST:  string | null;
  source:  string;
  status:  'live' | 'error';
}

interface LiquidityResponse {
  pools:     LiquidityPool[];
  count:     number;
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGST(gst?: string | null): string {
  if (!gst) return '—';
  const n = parseFloat(gst);
  if (Number.isNaN(n)) return gst;
  if (n >= 1e9) return `${(n / 1e9).toFixed(3)}B GST`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(3)}M GST`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(3)}K GST`;
  return `${n.toFixed(4)} GST`;
}

function shortAddr(addr: string): string {
  if (addr === '0x0' || addr.length < 10) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function TVLBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ background: '#1e1e2e', borderRadius: 4, height: 6, overflow: 'hidden' }}>
      <div style={{ background: '#3b82f6', width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 0.5s' }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LiquidityMonitor() {
  const [data,    setData]    = useState<LiquidityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge/liquidity', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as LiquidityResponse);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const intv = setInterval(() => void fetchData(), 15_000);
    return () => clearInterval(intv);
  }, [fetchData]);

  const pools = data?.pools ?? [];

  // Compute max TVL for bar scaling
  const tvlValues = pools.map(p => parseFloat(p.tvlGST ?? '0') || 0);
  const maxTvl    = Math.max(...tvlValues, 0);
  const totalTvl  = tvlValues.reduce((a, b) => a + b, 0);

  const liveCount  = pools.filter(p => p.status === 'live').length;
  const errorCount = pools.filter(p => p.status === 'error').length;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'monospace', padding: '24px 20px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>
            Cross-Chain Liquidity Monitor
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            L1↔L2↔L3 bridge TVL · Read-only · Canonical bridge addresses
            {data?.timestamp && ` · Updated ${new Date(data.timestamp).toLocaleTimeString()}`}
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total TVL',  value: formatGST(String(totalTvl)),      color: '#3b82f6' },
            { label: 'Live Pools', value: String(liveCount),                 color: '#22c55e' },
            { label: 'Offline',    value: String(errorCount),                color: errorCount > 0 ? '#ef4444' : '#6b7280' },
          ].map(s => (
            <div key={s.label} style={{ background: '#111827', border: '1px solid #1e1e2e', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #dc2626', borderRadius: 6, padding: '8px 12px', color: '#fca5a5', fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading liquidity data…</div>
        ) : pools.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#374151', padding: 60 }}>No pool data available from bridge contracts or GhostBrain.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pools.map((pool, i) => {
              const tvlNum = parseFloat(pool.tvlGST ?? '0') || 0;
              return (
                <div
                  key={`${pool.address}-${i}`}
                  style={{
                    background:   '#111827',
                    border:       `1px solid ${pool.status === 'error' ? '#7f1d1d' : '#1e1e2e'}`,
                    borderRadius: 8,
                    padding:      '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: pool.status === 'live' ? '#22c55e' : '#ef4444' }} />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{pool.name}</span>
                        <span style={{ fontSize: 10, color: '#6b7280', background: '#1e1e2e', padding: '1px 6px', borderRadius: 4 }}>
                          {pool.chains}
                        </span>
                        <span style={{ fontSize: 9, color: '#4b5563' }}>{pool.source}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#4b5563', marginTop: 3, fontFamily: 'monospace' }}>
                        {shortAddr(pool.address)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: pool.status === 'error' ? '#ef4444' : '#3b82f6' }}>
                        {formatGST(pool.tvlGST)}
                      </div>
                      {pool.status === 'error' && (
                        <div style={{ fontSize: 10, color: '#ef4444' }}>RPC unreachable</div>
                      )}
                    </div>
                  </div>
                  <TVLBar value={tvlNum} max={maxTvl} />
                  {maxTvl > 0 && (
                    <div style={{ fontSize: 9, color: '#374151', marginTop: 4, textAlign: 'right' }}>
                      {maxTvl > 0 ? ((tvlNum / totalTvl) * 100).toFixed(1) : '0'}% of total TVL
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info footer */}
        <div style={{ marginTop: 20, padding: '10px 14px', background: '#0d1117', border: '1px solid #161b22', borderRadius: 6, fontSize: 10, color: '#374151' }}>
          <b style={{ color: '#4b5563' }}>Canonical Addresses</b> ·
          L2L3Bridge: 0xDadd11… · L1→L2: 0xad32D5… · L2→L3: 0x130A46… ·
          All bridge addresses are governance-locked.
        </div>
      </div>
    </div>
  );
}
