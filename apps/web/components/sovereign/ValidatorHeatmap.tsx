'use client';

import { LayerBadge } from '@/components/brand/LayerBadge';

interface ValidatorNode {
  id: string;
  name: string;
  region: string;
  country: string;
  stake: number;
  score: number;
  uptime: number;
  status: 'ACTIVE' | 'QUARANTINE' | 'OFFLINE' | 'SYNCING';
  stakeWeight: number; // 0-1 normalized
}

interface ValidatorHeatmapProps {
  validators?: ValidatorNode[];
  totalStake?: number;
  className?: string;
}

const STATUS_CONFIG = {
  ACTIVE:     { color: '#00F0B5', label: 'ACTIVE'     },
  QUARANTINE: { color: '#FF3B3B', label: 'QUARANTINE' },
  OFFLINE:    { color: '#8A9BB5', label: 'OFFLINE'    },
  SYNCING:    { color: '#C9A227', label: 'SYNCING'    },
};

const REGION_CONFIG: Record<string, { color: string; label: string }> = {
  'NA':   { color: '#7A5CFF', label: 'North America' },
  'EU':   { color: '#00C2FF', label: 'Europe'        },
  'APAC': { color: '#00F0B5', label: 'Asia Pacific'  },
  'LATAM':{ color: '#C9A227', label: 'Latin America' },
  'MEA':  { color: '#FF3B3B', label: 'Middle East & Africa' },
};

const DEFAULT_VALIDATORS: ValidatorNode[] = [
  { id: 'v01', name: 'Ghost-NA-01', region: 'NA',   country: 'US',  stake: 250_000, score: 0.97, uptime: 99.8, status: 'ACTIVE',  stakeWeight: 0.95 },
  { id: 'v02', name: 'Ghost-NA-02', region: 'NA',   country: 'CA',  stake: 180_000, score: 0.94, uptime: 99.5, status: 'ACTIVE',  stakeWeight: 0.72 },
  { id: 'v03', name: 'Ghost-EU-01', region: 'EU',   country: 'DE',  stake: 220_000, score: 0.96, uptime: 99.9, status: 'ACTIVE',  stakeWeight: 0.88 },
  { id: 'v04', name: 'Ghost-EU-02', region: 'EU',   country: 'NL',  stake: 150_000, score: 0.91, uptime: 99.2, status: 'ACTIVE',  stakeWeight: 0.60 },
  { id: 'v05', name: 'Ghost-EU-03', region: 'EU',   country: 'FR',  stake: 130_000, score: 0.89, uptime: 98.8, status: 'ACTIVE',  stakeWeight: 0.52 },
  { id: 'v06', name: 'Ghost-AP-01', region: 'APAC', country: 'SG',  stake: 200_000, score: 0.95, uptime: 99.7, status: 'ACTIVE',  stakeWeight: 0.80 },
  { id: 'v07', name: 'Ghost-AP-02', region: 'APAC', country: 'JP',  stake: 160_000, score: 0.92, uptime: 99.3, status: 'ACTIVE',  stakeWeight: 0.64 },
  { id: 'v08', name: 'Ghost-AP-03', region: 'APAC', country: 'AU',  stake: 120_000, score: 0.88, uptime: 98.5, status: 'SYNCING', stakeWeight: 0.48 },
  { id: 'v09', name: 'Ghost-LA-01', region: 'LATAM',country: 'BR',  stake: 100_000, score: 0.85, uptime: 98.1, status: 'ACTIVE',  stakeWeight: 0.40 },
  { id: 'v10', name: 'Ghost-ME-01', region: 'MEA',  country: 'AE',  stake: 110_000, score: 0.87, uptime: 98.4, status: 'ACTIVE',  stakeWeight: 0.44 },
];

function scoreColor(score: number): string {
  if (score >= 0.90) return '#00F0B5';
  if (score >= 0.75) return '#C9A227';
  if (score >= 0.50) return '#00C2FF';
  return '#FF3B3B';
}

function formatStake(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/**
 * ValidatorHeatmap — Geographic validator federation visualization.
 * Shows validator nodes, scores, stake weights, regions, and status.
 * Constitutional requirement: minimum 3 distinct regions enforced.
 */
export function ValidatorHeatmap({
  validators = DEFAULT_VALIDATORS,
  totalStake = 1_620_000,
  className = '',
}: ValidatorHeatmapProps) {
  const activeCount = validators.filter(v => v.status === 'ACTIVE').length;
  const regions = [...new Set(validators.map(v => v.region))];
  const avgScore = validators.reduce((s, v) => s + v.score, 0) / validators.length;

  // Group by region
  const byRegion = regions.reduce<Record<string, ValidatorNode[]>>((acc, r) => {
    acc[r] = validators.filter(v => v.region === r);
    return acc;
  }, {});

  // Regional stake concentration check (constitutional: no region > 40%)
  const regionalStake = regions.map(r => ({
    region: r,
    stake: byRegion[r].reduce((s, v) => s + v.stake, 0),
    pct: byRegion[r].reduce((s, v) => s + v.stake, 0) / totalStake * 100,
  }));

  return (
    <div
      className={`sovereign-card relative overflow-hidden ${className}`}
      style={{ borderColor: 'rgba(201,162,39,0.2)' }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, #C9A227, #7A5CFF, transparent)',
      }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayerBadge layer="L1" showDot />
          <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#C9A227' }}>
            Validator Federation
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#8A9BB5' }}>
            {activeCount}/{validators.length} active
          </span>
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#8A9BB5' }}>
            {regions.length} regions
          </span>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Total Stake',   value: `${formatStake(totalStake)} GST`, color: '#C9A227' },
          { label: 'Avg Score',     value: `${(avgScore * 100).toFixed(1)}%`, color: '#00F0B5' },
          { label: 'Regions',       value: `${regions.length} / 3 min`,       color: regions.length >= 3 ? '#00F0B5' : '#FF3B3B' },
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

      {/* Regional stake concentration */}
      <div className="mb-4">
        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 6 }}>
          Regional Stake Distribution (Constitutional Cap: 40%)
        </p>
        <div className="flex flex-col gap-1.5">
          {regionalStake.map((r) => {
            const cfg = REGION_CONFIG[r.region] ?? { color: '#8A9BB5', label: r.region };
            const overCap = r.pct > 40;
            return (
              <div key={r.region}>
                <div className="flex justify-between mb-0.5">
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: cfg.color }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', color: overCap ? '#FF3B3B' : '#8A9BB5' }}>
                    {r.pct.toFixed(1)}% {overCap ? '⚠ OVER CAP' : ''}
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, r.pct)}%`,
                    background: overCap ? '#FF3B3B' : cfg.color,
                    opacity: 0.7,
                    borderRadius: 2,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Validator node grid */}
      <div>
        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 6 }}>
          Node Registry
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {validators.map((v) => {
            const statusCfg = STATUS_CONFIG[v.status];
            const regionCfg = REGION_CONFIG[v.region] ?? { color: '#8A9BB5', label: v.region };
            const dotSize = Math.max(8, v.stakeWeight * 14);

            return (
              <div
                key={v.id}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${scoreColor(v.score)}20`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  position: 'relative',
                }}
                title={`${v.name} | Score: ${(v.score * 100).toFixed(0)}% | Uptime: ${v.uptime}% | Stake: ${formatStake(v.stake)} GST`}
              >
                {/* Score indicator dot */}
                <div className="flex items-center justify-between mb-1.5">
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#8A9BB5' }}>
                    {v.id.toUpperCase()}
                  </span>
                  <span style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '50%',
                    background: scoreColor(v.score),
                    boxShadow: `0 0 ${dotSize / 2}px ${scoreColor(v.score)}`,
                    display: 'inline-block',
                    flexShrink: 0,
                  }} />
                </div>

                <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.68rem', fontWeight: 600, color: regionCfg.color, marginBottom: 2 }}>
                  {v.country} · {v.region}
                </div>

                <div className="flex items-center justify-between">
                  <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.7rem', fontWeight: 700, color: scoreColor(v.score) }}>
                    {(v.score * 100).toFixed(0)}%
                  </span>
                  <span style={{
                    padding: '1px 4px',
                    background: `${statusCfg.color}15`,
                    borderRadius: 3,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '0.52rem',
                    fontWeight: 600,
                    color: statusCfg.color,
                    letterSpacing: '0.06em',
                  }}>
                    {statusCfg.label}
                  </span>
                </div>

                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', color: '#8A9BB5', marginTop: 2 }}>
                  {formatStake(v.stake)} GST
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score legend */}
      <div className="mt-3 flex items-center gap-4 flex-wrap" style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', color: '#8A9BB5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Score:
        </span>
        {[
          { label: '≥90%', color: '#00F0B5' },
          { label: '75–90%', color: '#C9A227' },
          { label: '50–75%', color: '#00C2FF' },
          { label: '<50%', color: '#FF3B3B' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', color: '#8A9BB5' }}>{s.label}</span>
          </div>
        ))}
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', color: '#8A9BB5', marginLeft: 'auto' }}>
          Dot size = stake weight
        </span>
      </div>
    </div>
  );
}
