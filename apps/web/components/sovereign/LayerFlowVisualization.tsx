'use client';

import { LayerBadge } from '@/components/brand/LayerBadge';

interface LayerFlowData {
  l3Revenue: number;
  l2Revenue: number;
  l1Intake: number;
  externalYield: number;
  distribution: number;
}

interface LayerFlowVisualizationProps {
  data?: LayerFlowData;
  epochLabel?: string;
  className?: string;
}

function formatGST(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

const LAYER_COLORS = {
  l3: '#00C2FF',
  l2: '#7A5CFF',
  l1: '#C9A227',
  ai: '#00F0B5',
};

/**
 * LayerFlowVisualization — L3→L2→L1 fee routing flow diagram.
 * Shows real-time revenue flow across the sovereign economic engine.
 * Constitutional routing law: L3→L2→L1, no bypass.
 */
export function LayerFlowVisualization({
  data = {
    l3Revenue:      48_750,
    l2Revenue:      61_200,
    l1Intake:       87_300,
    externalYield:  8_240,
    distribution:   6_592,
  },
  epochLabel = 'Epoch #47',
  className = '',
}: LayerFlowVisualizationProps) {
  const maxVal = Math.max(data.l3Revenue, data.l2Revenue, data.l1Intake);

  const barWidth = (val: number) => Math.max(8, (val / maxVal) * 100);

  return (
    <div
      className={`sovereign-card relative overflow-hidden ${className}`}
      style={{ borderColor: 'rgba(122,92,255,0.2)' }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, #00C2FF, #7A5CFF, #C9A227)',
      }} />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#E8EDF5' }}>
            Revenue Flows
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', color: '#8A9BB5', textTransform: 'uppercase' }}>
            {epochLabel}
          </span>
        </div>
      </div>

      {/* Routing Law Banner */}
      <div
        className="flex items-center gap-2 mb-5 flex-wrap"
        style={{
          padding: '6px 10px',
          background: 'rgba(122,92,255,0.06)',
          border: '1px solid rgba(122,92,255,0.15)',
          borderRadius: 8,
        }}
      >
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', color: '#8A9BB5', textTransform: 'uppercase' }}>
          ROUTING LAW
        </span>
        {(['L3', 'L2', 'L1'] as const).map((layer, i) => (
          <div key={layer} className="flex items-center gap-1.5">
            <LayerBadge layer={layer} showDot={false} size="sm" />
            {i < 2 && (
              <span style={{ color: '#7A5CFF', fontSize: '0.75rem', fontWeight: 700 }}>→</span>
            )}
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', color: '#8A9BB5' }}>
          No bypass
        </span>
      </div>

      {/* Flow Layers */}
      <div className="flex flex-col gap-3 mb-5">
        {[
          {
            layer: 'L3' as const,
            name: 'GhostL3',
            role: 'Utility & Application',
            value: data.l3Revenue,
            color: LAYER_COLORS.l3,
            sources: 'Gas · SDK · Deploy · Commission',
            arrow: '↓ → L2',
          },
          {
            layer: 'L2' as const,
            name: 'GhostL2',
            role: 'Liquidity & Exchange',
            value: data.l2Revenue,
            color: LAYER_COLORS.l2,
            sources: 'Trading · Swap · Bridge · Launchpad',
            arrow: '↓ → L1',
          },
          {
            layer: 'L1' as const,
            name: 'GhostChain',
            role: 'Sovereign Treasury',
            value: data.l1Intake,
            color: LAYER_COLORS.l1,
            sources: 'All L3 fees + 70% L2 fees',
            arrow: null,
          },
        ].map((item, _i) => (
          <div key={item.layer}>
            <div
              style={{
                background: `${item.color}08`,
                border: `1px solid ${item.color}25`,
                borderRadius: 10,
                padding: '12px 14px',
                position: 'relative',
              }}
            >
              {/* Left accent */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: item.color, borderRadius: '10px 0 0 10px' }} />

              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <LayerBadge layer={item.layer} showDot />
                  <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 600, color: item.color }}>
                    {item.name}
                  </span>
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.68rem', color: '#8A9BB5' }}>
                    — {item.role}
                  </span>
                </div>
                <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: item.color, letterSpacing: '0.04em', flexShrink: 0 }}>
                  {formatGST(item.value)} GST
                </span>
              </div>

              {/* Revenue bar */}
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${barWidth(item.value)}%`, background: item.color, opacity: 0.7, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>

              <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#8A9BB5', margin: 0 }}>
                {item.sources}
              </p>
            </div>

            {/* Arrow between layers */}
            {item.arrow && (
              <div className="flex items-center justify-center py-1">
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#7A5CFF', fontWeight: 700 }}>
                  {item.arrow}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* External Yield + Distribution */}
      <div className="grid grid-cols-2 gap-2">
        <div style={{ background: 'rgba(0,240,181,0.06)', border: '1px solid rgba(0,240,181,0.15)', borderRadius: 8, padding: '10px 12px' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <LayerBadge layer="AI" showDot={false} size="sm" />
            <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', color: '#8A9BB5', textTransform: 'uppercase' }}>
              External Yield
            </span>
          </div>
          <div style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#00F0B5', letterSpacing: '0.04em' }}>
            +{formatGST(data.externalYield)} GST
          </div>
        </div>
        <div style={{ background: 'rgba(201,162,39,0.06)', border: '1px solid rgba(201,162,39,0.15)', borderRadius: 8, padding: '10px 12px' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <LayerBadge layer="L1" showDot={false} size="sm" />
            <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', color: '#8A9BB5', textTransform: 'uppercase' }}>
              Distribution
            </span>
          </div>
          <div style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#C9A227', letterSpacing: '0.04em' }}>
            {formatGST(data.distribution)} GST
          </div>
        </div>
      </div>
    </div>
  );
}
