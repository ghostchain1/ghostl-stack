'use client';

import { useEffect, useState } from 'react';

type TreasuryData = {
  balance?: string;
  pending?: string;
  totalDistributed?: string;
  reserveRatio?: number;
  burnRate?: string;
  weeklyRevenue?: string;
  lastDistribution?: string;
};

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

function fmt(gst: string | undefined) {
  if (!gst) return '—';
  const n = Number(BigInt(gst) / BigInt(1e15)) / 1000;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' GST';
}

function ReserveGauge({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  const color = pct >= 20 ? '#22c55e' : pct >= 10 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>Reserve Ratio</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.6s' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        {pct < 10 ? 'Critical — below minimum reserve' : pct < 20 ? 'Warning — below target reserve' : 'Healthy reserve level'}
      </div>
    </div>
  );
}

export function TreasuryPage() {
  const [data, setData] = useState<TreasuryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/command-center/treasury', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as TreasuryData;
        if (!cancelled) { setData(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Treasury engine unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const stats = [
    { label: 'GST Balance', value: fmt(data?.balance) },
    { label: 'Pending Rewards', value: fmt(data?.pending) },
    { label: 'Total Distributed', value: fmt(data?.totalDistributed) },
    { label: 'Weekly Revenue', value: fmt(data?.weeklyRevenue) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Sovereign Treasury</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          SovereignTreasuryEngine — GST reserves, reward distribution, burn rate
        </p>
      </div>

      {error && (
        <div style={{ ...CARD, color: 'var(--danger)', fontSize: 13 }}>
          Treasury engine offline — {error}. Port 7683 not reachable.
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {stats.map(({ label, value }) => (
          <div key={label} style={CARD}>
            <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              {label}
            </div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18, wordBreak: 'break-all' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Reserve gauge */}
      <div style={CARD}>
        {data?.reserveRatio !== undefined ? (
          <ReserveGauge ratio={data.reserveRatio} />
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading reserve data…</div>
        )}
      </div>

      {/* Additional details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={CARD}>
          <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Burn Rate</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>
            {data?.burnRate ? fmt(data.burnRate) + '/epoch' : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            L2 + L3 sequencer fee burn combined
          </div>
        </div>
        <div style={CARD}>
          <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Last Distribution</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16 }}>
            {data?.lastDistribution ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            RewardDistributor epoch settlement
          </div>
        </div>
      </div>

      {/* Constitution note */}
      <div style={{ ...CARD, padding: '14px 18px', borderLeft: '3px solid var(--accent)', fontSize: 12, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Governance-Locked:</strong> Reserve ratio and burn parameters are set by <code>GhostConstitution</code> clauses and require a governance super-majority to amend.
      </div>
    </div>
  );
}
