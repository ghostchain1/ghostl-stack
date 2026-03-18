'use client';

import { useEffect, useState } from 'react';

const UNIVERSE_API = process.env.NEXT_PUBLIC_UNIVERSE_API ?? 'http://localhost:7700';

interface EconomyStats {
  l1BalanceGST:    string;
  l2VolumeGST:     string;
  l3VolumeGST:     string;
  platformFeesGST: string;
  totalTxCount:    number;
}

const UNIT = 10n ** 18n;

function formatGST(wei: string): string {
  try {
    const whole = BigInt(wei) / UNIT;
    return whole.toLocaleString() + ' GST';
  } catch { return '—'; }
}

export function EconomyStats() {
  const [stats,  setStats]  = useState<EconomyStats | null>(null);
  const [error,  setError]  = useState('');

  useEffect(() => {
    const load = () => {
      fetch(`${UNIVERSE_API}/economy`)
        .then(r => r.json())
        .then((d: { stats: EconomyStats }) => setStats(d.stats))
        .catch(() => setError('Unable to reach Ghost Universe API'));
    };
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>
      <h2>Ghost Universe — Economy Flow</h2>

      {error && <p style={{ color: '#ff8a65' }}>{error}</p>}

      {/* Routing law visual */}
      <div style={{
        display:    'flex', alignItems: 'center', gap: 8,
        marginBottom: 24, padding: '10px 16px',
        background: '#101020', border: '1px solid #333', borderRadius: 6,
        fontSize: 13,
      }}>
        <ChainBadge label="L3 In-World" color="#5a0fd9" />
        <Arrow />
        <ChainBadge label="L2 Settlement" color="#0d7a5f" />
        <Arrow />
        <ChainBadge label="L1 Treasury" color="#b5270f" />
        <span style={{ color: '#666', marginLeft: 8 }}>— Routing Law (enforced)</span>
      </div>

      {/* Stats grid */}
      {stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <StatCard
            label="L1 Treasury Balance"
            value={formatGST(stats.l1BalanceGST)}
            color="#b5270f"
            sublabel="GhostChain L1 (chain 14000101)"
          />
          <StatCard
            label="L2 Volume"
            value={formatGST(stats.l2VolumeGST)}
            color="#0d7a5f"
            sublabel="GhostL2 (chain 901) — land & assets"
          />
          <StatCard
            label="L3 Volume"
            value={formatGST(stats.l3VolumeGST)}
            color="#5a0fd9"
            sublabel="GhostL3 (chain 903) — in-world GST"
          />
          <StatCard
            label="Platform Fees Collected"
            value={formatGST(stats.platformFeesGST)}
            color="#c17f24"
            sublabel="2.5% on trades"
          />
          <StatCard
            label="Total Transactions"
            value={stats.totalTxCount.toLocaleString()}
            color="#4a90e2"
            sublabel="All chains combined"
          />
        </div>
      ) : (
        !error && <p style={{ color: '#666' }}>Loading economy data…</p>
      )}

      {/* GST token note */}
      <p style={{ color: '#555', fontSize: 11, marginTop: 20 }}>
        All values are GST-denominated and follow GhostChain native gas semantics only.
        Transactions follow routing law: L3 → L2 → L1 only.
      </p>
    </div>
  );
}

function StatCard({ label, value, color, sublabel }: {
  label: string; value: string; color: string; sublabel: string;
}) {
  return (
    <div style={{
      background:   '#1a1a2a',
      border:       `1px solid ${color}55`,
      borderLeft:   `3px solid ${color}`,
      borderRadius: 6, padding: '12px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{sublabel}</div>
    </div>
  );
}

function ChainBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: color + '33', border: `1px solid ${color}`,
      borderRadius: 4, padding: '3px 8px', color: '#ddd', fontWeight: 'bold',
    }}>
      {label}
    </span>
  );
}

function Arrow() {
  return <span style={{ color: '#555', fontSize: 18 }}>→</span>;
}
