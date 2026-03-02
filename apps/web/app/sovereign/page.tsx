import { Metadata } from 'next';
import { GasEquilibriumPanel } from '@/components/sovereign/GasEquilibriumPanel';
import { TreasuryMetricsCard } from '@/components/sovereign/TreasuryMetricsCard';
import { LayerFlowVisualization } from '@/components/sovereign/LayerFlowVisualization';
import { GovernanceVotePanel } from '@/components/sovereign/GovernanceVotePanel';
import { AIActivityStream } from '@/components/sovereign/AIActivityStream';
import { ValidatorHeatmap } from '@/components/sovereign/ValidatorHeatmap';

export const metadata: Metadata = {
  title: 'Sovereign Dashboard — GhostStack',
  description: 'Real-time sovereign economic engine: treasury, gas, validators, governance, and AI systems.',
};

export default function SovereignDashboardPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0B0F14',
        padding: '32px 24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#00F0B5',
            boxShadow: '0 0 12px rgba(0,240,181,0.6)',
          }} />
          <span style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: '#00F0B5',
            textTransform: 'uppercase',
          }}>
            Live · Epoch #47
          </span>
        </div>
        <h1 style={{
          fontFamily: 'Orbitron, system-ui, sans-serif',
          fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
          fontWeight: 700,
          color: '#E8EDF5',
          letterSpacing: '0.04em',
          marginBottom: 6,
        }}>
          Sovereign Dashboard
        </h1>
        <p style={{
          fontFamily: 'Sora, system-ui, sans-serif',
          fontSize: '0.9rem',
          color: '#8A9BB5',
          maxWidth: 600,
        }}>
          Vertically integrated economic engine — L3 → L2 → L1. Constitutional routing enforced.
          AI advisory. Treasury sovereign.
        </p>
      </div>

      {/* Routing Law Banner */}
      <div
        className="flex items-center gap-3 mb-8 flex-wrap"
        style={{
          padding: '10px 16px',
          background: 'rgba(122,92,255,0.06)',
          border: '1px solid rgba(122,92,255,0.2)',
          borderRadius: 10,
        }}
      >
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.14em', color: '#8A9BB5', textTransform: 'uppercase' }}>
          Constitutional Routing Law
        </span>
        {[
          { label: 'GhostL3', sub: 'Utility', color: '#00C2FF' },
          { label: '→', sub: '', color: '#7A5CFF' },
          { label: 'GhostL2', sub: 'Liquidity', color: '#7A5CFF' },
          { label: '→', sub: '', color: '#7A5CFF' },
          { label: 'GhostChain', sub: 'Treasury', color: '#C9A227' },
        ].map((item, i) => (
          item.label === '→' ? (
            <span key={i} style={{ color: '#7A5CFF', fontSize: '1rem', fontWeight: 700 }}>→</span>
          ) : (
            <div key={i} className="flex items-center gap-1">
              <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.78rem', fontWeight: 600, color: item.color }}>
                {item.label}
              </span>
              {item.sub && (
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#8A9BB5' }}>
                  ({item.sub})
                </span>
              )}
            </div>
          )
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#8A9BB5' }}>
          No bypass permitted · Invariant enforced
        </span>
      </div>

      {/* Primary Grid — Row 1: Treasury + Gas + Layer Flow */}
      <div
        className="mb-6"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
        }}
      >
        <TreasuryMetricsCard />
        <GasEquilibriumPanel />
        <LayerFlowVisualization />
      </div>

      {/* Secondary Grid — Row 2: AI Stream + Governance */}
      <div
        className="mb-6"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 20,
        }}
      >
        <AIActivityStream />
        <GovernanceVotePanel />
      </div>

      {/* Full-width — Row 3: Validator Heatmap */}
      <div className="mb-6">
        <ValidatorHeatmap />
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between flex-wrap gap-3"
        style={{
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#7A5CFF',
            letterSpacing: '0.08em',
          }}>
            GHOSTSTACK
          </span>
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5' }}>
            Sovereign Economic Engine · L1 Chain ID: 14000101 · L2 Chain ID: 901
          </span>
        </div>
        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5', letterSpacing: '0.08em' }}>
          Autonomy Secured.
        </span>
      </div>
    </main>
  );
}
