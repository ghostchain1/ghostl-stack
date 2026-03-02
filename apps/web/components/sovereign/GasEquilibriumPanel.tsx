'use client';

import { LayerBadge } from '@/components/brand/LayerBadge';

interface GasTick {
  epoch: number;
  l1BaseFee: number;
  l2BaseFee: number;
  l3BaseFee: number;
}

interface GasEquilibriumPanelProps {
  l1BaseFeeGwei?: number;
  l2BaseFeeGwei?: number;
  l3BaseFeeGwei?: number;
  equilibriumTarget?: number;
  utilizationPct?: number;
  adjustmentVelocity?: number;
  lastAdjustedEpoch?: number;
  history?: GasTick[];
  className?: string;
}

const DEFAULT_HISTORY: GasTick[] = [
  { epoch: 1, l1BaseFee: 22, l2BaseFee: 3.1, l3BaseFee: 0.4 },
  { epoch: 2, l1BaseFee: 21, l2BaseFee: 3.0, l3BaseFee: 0.38 },
  { epoch: 3, l1BaseFee: 23, l2BaseFee: 3.2, l3BaseFee: 0.41 },
  { epoch: 4, l1BaseFee: 24, l2BaseFee: 3.3, l3BaseFee: 0.43 },
  { epoch: 5, l1BaseFee: 22, l2BaseFee: 3.1, l3BaseFee: 0.39 },
  { epoch: 6, l1BaseFee: 20, l2BaseFee: 2.9, l3BaseFee: 0.37 },
  { epoch: 7, l1BaseFee: 21, l2BaseFee: 3.0, l3BaseFee: 0.38 },
  { epoch: 8, l1BaseFee: 22, l2BaseFee: 3.1, l3BaseFee: 0.40 },
];

function UtilizationBar({ pct }: { pct: number }) {
  const color =
    pct > 85 ? '#FF3B3B'
    : pct > 65 ? '#C9A227'
    : '#00F0B5';
  return (
    <div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(pct, 100)}%`,
            background: color,
            borderRadius: 999,
            boxShadow: `0 0 8px ${color}55`,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.72rem',
          color: 'var(--muted, #8A9BB5)',
        }}
      >
        <span>0%</span>
        <span style={{ color }}>{pct.toFixed(1)}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function MiniSparkline({ ticks, colorKey }: { ticks: GasTick[]; colorKey: 'l1BaseFee' | 'l2BaseFee' | 'l3BaseFee' }) {
  const values = ticks.map((t) => t[colorKey]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const layerColors: Record<typeof colorKey, string> = {
    l1BaseFee: '#C9A227',
    l2BaseFee: '#7A5CFF',
    l3BaseFee: '#00C2FF',
  };
  const color = layerColors[colorKey];

  const w = 160;
  const h = 40;
  const step = w / (ticks.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true">
      <polyline
        points={points}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.85"
      />
      <polyline
        points={`0,${h} ${points} ${w},${h}`}
        stroke="none"
        fill={color}
        opacity="0.08"
      />
    </svg>
  );
}

/**
 * GasEquilibriumPanel — GhostStack Gas Equilibrium Monitor.
 *
 * Displays live L1/L2/L3 base fees, block-space utilization, and
 * the AI-driven gas equilibrium adjustment velocity across the
 * three-layer sovereign stack.
 *
 * Layer colors follow the canonical brand palette:
 * L1 → Sovereign Gold #C9A227
 * L2 → Spectral Purple #7A5CFF
 * L3 → Ghost Blue #00C2FF
 */
export function GasEquilibriumPanel({
  l1BaseFeeGwei = 22.4,
  l2BaseFeeGwei = 3.1,
  l3BaseFeeGwei = 0.40,
  equilibriumTarget = 20,
  utilizationPct = 71.4,
  adjustmentVelocity = 1.08,
  lastAdjustedEpoch = 48,
  history = DEFAULT_HISTORY,
  className = '',
}: GasEquilibriumPanelProps) {
  const layers = [
    { key: 'l1BaseFee' as const, badge: 'L1' as const, name: 'GhostChain', value: l1BaseFeeGwei, color: '#C9A227' },
    { key: 'l2BaseFee' as const, badge: 'L2' as const, name: 'GhostL2',    value: l2BaseFeeGwei, color: '#7A5CFF' },
    { key: 'l3BaseFee' as const, badge: 'L3' as const, name: 'GhostL3',    value: l3BaseFeeGwei, color: '#00C2FF' },
  ];

  return (
    <div
      className={`sovereign-card relative overflow-hidden ${className}`}
      style={{ borderColor: 'rgba(0,240,181,0.18)' }}
    >
      {/* AI accent bar — Neural Teal */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 2,
          background: 'linear-gradient(90deg, #00F0B5, transparent)',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LayerBadge layer="AI" showDot />
          <span
            style={{
              fontFamily: 'Sora, system-ui, sans-serif',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#00F0B5',
            }}
          >
            Gas Equilibrium AI
          </span>
        </div>
        <div
          style={{
            padding: '3px 10px',
            borderRadius: 999,
            background: 'rgba(0,240,181,0.10)',
            border: '1px solid rgba(0,240,181,0.30)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#00F0B5',
            letterSpacing: '0.10em',
          }}
        >
          ACTIVE
        </div>
      </div>

      {/* Block utilization */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.72rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#8A9BB5',
          }}
        >
          <span>Block Utilization</span>
          <span>Epoch {lastAdjustedEpoch}</span>
        </div>
        <UtilizationBar pct={utilizationPct} />
      </div>

      {/* L1 / L2 / L3 base fees */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {layers.map((layer) => (
          <div key={layer.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LayerBadge layer={layer.badge} />
            <div style={{ flex: 1 }}>
              <MiniSparkline ticks={history} colorKey={layer.key} />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.88rem',
                fontWeight: 700,
                color: layer.color,
                minWidth: 68,
                textAlign: 'right',
              }}
            >
              {layer.value.toFixed(2)} Gwei
            </div>
          </div>
        ))}
      </div>

      {/* Equilibrium target vs velocity */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '0.65rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#8A9BB5',
              marginBottom: 4,
            }}
          >
            L1 Target
          </div>
          <div
            style={{
              fontFamily: 'Orbitron, system-ui, sans-serif',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: '#C9A227',
            }}
          >
            {equilibriumTarget} Gwei
          </div>
        </div>
        <div>
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '0.65rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#8A9BB5',
              marginBottom: 4,
            }}
          >
            Adj. Velocity
          </div>
          <div
            style={{
              fontFamily: 'Orbitron, system-ui, sans-serif',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: adjustmentVelocity > 1 ? '#00F0B5' : '#FF3B3B',
            }}
          >
            ×{adjustmentVelocity.toFixed(3)}
          </div>
        </div>
      </div>
    </div>
  );
}
