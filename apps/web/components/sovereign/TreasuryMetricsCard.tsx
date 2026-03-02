'use client';

import { LayerBadge } from '@/components/brand/LayerBadge';

interface TreasuryAllocation {
  label: string;
  percent: number;
  color: string;
}

interface TreasuryMetricsCardProps {
  balance?: number;
  deployed?: number;
  reserveFloor?: number;
  epochYield?: number;
  epochBurn?: number;
  epochBuyback?: number;
  solventProof?: boolean;
  proofEpoch?: number;
  allocation?: TreasuryAllocation[];
  className?: string;
}

const DEFAULT_ALLOCATION: TreasuryAllocation[] = [
  { label: 'Stable Assets',    percent: 65, color: '#00F0B5' },
  { label: 'Yield Strategies', percent: 25, color: '#7A5CFF' },
  { label: 'Reserve Buffer',   percent: 10, color: '#C9A227' },
];

function formatGST(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

/**
 * TreasuryMetricsCard — Sovereign treasury state visualization.
 * Shows balance, allocation, yield, burn, buyback, and ZK solvency proof status.
 */
export function TreasuryMetricsCard({
  balance = 1_247_832,
  deployed = 412_000,
  reserveFloor = 249_566,
  epochYield = 8_240,
  epochBurn = 3_120,
  epochBuyback = 1_236,
  solventProof = true,
  proofEpoch = 47,
  allocation = DEFAULT_ALLOCATION,
  className = '',
}: TreasuryMetricsCardProps) {
  const reservePct = Math.round((reserveFloor / balance) * 100);
  const deployedPct = Math.round((deployed / balance) * 100);

  return (
    <div
      className={`sovereign-card relative overflow-hidden ${className}`}
      style={{ borderColor: 'rgba(201,162,39,0.2)' }}
    >
      {/* Top accent bar — Sovereign Gold */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, #C9A227, transparent)',
      }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayerBadge layer="L1" showDot />
          <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#C9A227' }}>
            Ghost Treasury
          </span>
        </div>
        {/* ZK Solvency Proof */}
        <div
          className="flex items-center gap-1.5"
          style={{
            padding: '3px 8px',
            background: solventProof ? 'rgba(0,240,181,0.1)' : 'rgba(255,59,59,0.1)',
            border: `1px solid ${solventProof ? 'rgba(0,240,181,0.3)' : 'rgba(255,59,59,0.3)'}`,
            borderRadius: 999,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: solventProof ? '#00F0B5' : '#FF3B3B', display: 'inline-block' }} />
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', color: solventProof ? '#00F0B5' : '#FF3B3B', textTransform: 'uppercase' }}>
            ZK PROOF #{proofEpoch}
          </span>
        </div>
      </div>

      {/* Balance — primary metric */}
      <div className="mb-5">
        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 4 }}>
          Treasury Balance
        </p>
        <div className="flex items-baseline gap-2">
          <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '2rem', fontWeight: 700, color: '#C9A227', letterSpacing: '0.04em' }}>
            {formatGST(balance)}
          </span>
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.8rem', color: '#8A9BB5' }}>GST</span>
        </div>
      </div>

      {/* Reserve floor bar */}
      <div className="mb-4">
        <div className="flex justify-between mb-1">
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', color: '#8A9BB5', textTransform: 'uppercase' }}>
            Reserve Floor
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#C9A227' }}>
            {formatGST(reserveFloor)} GST ({reservePct}%)
          </span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${reservePct}%`, background: 'linear-gradient(90deg, #C9A227, #e8b830)', borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Allocation donut (simplified bar chart) */}
      <div className="mb-4">
        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 8 }}>
          Asset Allocation
        </p>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          {allocation.map((a) => (
            <div
              key={a.label}
              style={{ flex: a.percent, background: a.color, opacity: 0.8, transition: 'flex 0.5s ease' }}
              title={`${a.label}: ${a.percent}%`}
            />
          ))}
        </div>
        <div className="flex gap-3 mt-2 flex-wrap">
          {allocation.map((a) => (
            <div key={a.label} className="flex items-center gap-1">
              <span style={{ width: 6, height: 6, borderRadius: 2, background: a.color, display: 'inline-block' }} />
              <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#8A9BB5' }}>
                {a.label} {a.percent}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Epoch metrics */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Epoch Yield',   value: `+${formatGST(epochYield)}`,   color: '#00F0B5' },
          { label: 'Epoch Burn',    value: `-${formatGST(epochBurn)}`,    color: '#FF3B3B' },
          { label: 'Buyback Burn',  value: `-${formatGST(epochBuyback)}`, color: '#7A5CFF' },
        ].map((m) => (
          <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 3 }}>
              {m.label}
            </div>
            <div style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: m.color, letterSpacing: '0.04em' }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Deployed capital */}
      <div className="mt-3 flex items-center justify-between" style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5' }}>
          Deployed Capital
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#7A5CFF' }}>
          {formatGST(deployed)} GST ({deployedPct}%)
        </span>
      </div>
    </div>
  );
}
