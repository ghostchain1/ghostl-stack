import Link from 'next/link';
import { LayerBadge } from '@/components/brand/LayerBadge';

// ── Ecosystem product grid ────────────────────────────────────────────────
const econSections = [
  {
    href: '/econ/treasury',
    layer: 'L1' as const,
    name: 'Ghost Treasury',
    role: 'Sovereign Settlement & Yield Engine',
    description: 'Holdings, inflows, strategy positions, and yield allocation.',
    color: '#C9A227',
    bg: 'rgba(201,162,39,0.08)',
    border: 'rgba(201,162,39,0.2)',
  },
  {
    href: '/econ/governance',
    layer: 'L1' as const,
    name: 'Governance',
    role: 'Constitutional Ratification Layer',
    description: 'Proposals, timelocks, quorum status, and execution receipts.',
    color: '#C9A227',
    bg: 'rgba(201,162,39,0.08)',
    border: 'rgba(201,162,39,0.2)',
  },
  {
    href: '/econ/risk',
    layer: 'AI' as const,
    name: 'Risk Oracle',
    role: 'Hyper Ghost AI — Risk Intelligence',
    description: 'Strategy risk scores, allocation caps, and policy enforcement.',
    color: '#00F0B5',
    bg: 'rgba(0,240,181,0.08)',
    border: 'rgba(0,240,181,0.2)',
  },
  {
    href: '/econ/flows',
    layer: 'L2' as const,
    name: 'Revenue Flows',
    role: 'L3 → L2 → L1 Fee Routing',
    description: 'Live fee routing, aggregation batches, and flow oracle counters.',
    color: '#7A5CFF',
    bg: 'rgba(122,92,255,0.08)',
    border: 'rgba(122,92,255,0.2)',
  },
  {
    href: '/econ/proofs',
    layer: 'L1' as const,
    name: 'Solvency Proofs',
    role: 'ZK Proof of Solvency',
    description: 'Merkle roots, snapshot epochs, and on-chain proof verification.',
    color: '#C9A227',
    bg: 'rgba(201,162,39,0.08)',
    border: 'rgba(201,162,39,0.2)',
  },
  {
    href: '/econ/alerts-logs',
    layer: 'SEC' as const,
    name: 'Alerts & Logs',
    role: 'GhostSentinel — Execution Audit',
    description: 'Signed execution receipts, policy violations, and audit trail.',
    color: '#FF3B3B',
    bg: 'rgba(255,59,59,0.08)',
    border: 'rgba(255,59,59,0.2)',
  },
  {
    href: '/econ/financials',
    layer: 'L1' as const,
    name: 'Financial Model',
    role: '5-Year Institutional Projection',
    description: 'Revenue trajectory, treasury growth, GST supply dynamics, and validator APY across Bear / Base / Bull scenarios.',
    color: '#C9A227',
    bg: 'rgba(201,162,39,0.08)',
    border: 'rgba(201,162,39,0.2)',
  },
];

// ── Flywheel steps ────────────────────────────────────────────────────────
const flywheelSteps = [
  { step: '01', layer: 'L3' as const, label: 'L3 Generates Activity', desc: 'Gas · SDK · Deploy · Commission fees' },
  { step: '02', layer: 'L2' as const, label: 'L2 Monetizes Liquidity', desc: 'Trading · Swap · Bridge · Launchpad fees' },
  { step: '03', layer: 'L1' as const, label: 'L1 Aggregates Revenue', desc: 'Treasury intake · Governance verification' },
  { step: '04', layer: 'AI' as const, label: 'AI Deploys Capital', desc: 'External yield · Risk-scored allocation' },
  { step: '05', layer: 'L1' as const, label: 'Yield Returns', desc: 'Validator rewards · Dev grants · Incentives' },
  { step: '06', layer: 'L3' as const, label: 'Ecosystem Grows', desc: 'Higher volume · Larger treasury · Repeat' },
];

export default function EconHomePage() {
  return (
    <main
      className="mx-auto max-w-7xl px-6 py-10"
      style={{ animation: 'rise 0.4s ease-out forwards' }}
    >
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <LayerBadge layer="L1" showDot />
          <LayerBadge layer="L2" showDot />
          <LayerBadge layer="L3" showDot />
          <LayerBadge layer="AI" showDot />
        </div>

        <h1
          className="font-display text-ghost-white uppercase"
          style={{
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            lineHeight: 1.1,
            marginBottom: 8,
          }}
        >
          Sovereign Economic Engine
        </h1>

        <p
          className="font-body"
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.9rem',
            color: '#8A9BB5',
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          Closed-loop autonomous treasury. L3 fees route to L2, aggregate to L1, deploy externally,
          yield returns, ecosystem compounds.{' '}
          <span style={{ color: '#7A5CFF' }}>No bypass. No exceptions.</span>
        </p>
      </div>

      {/* ── Routing Law Banner ───────────────────────────────────────────── */}
      <div
        className="mb-10 rounded-md px-5 py-4 flex items-center gap-4 flex-wrap"
        style={{
          background: 'rgba(122,92,255,0.06)',
          border: '1px solid rgba(122,92,255,0.2)',
          borderRadius: 10,
        }}
      >
        <span className="section-label" style={{ color: '#8A9BB5' }}>ROUTING LAW</span>
        <div className="flex items-center gap-2 flex-wrap">
          {(['L3', 'L2', 'L1'] as const).map((layer, i) => (
            <div key={layer} className="flex items-center gap-2">
              <LayerBadge layer={layer} showDot showName={false} />
              {i < 2 && (
                <span style={{ color: '#7A5CFF', fontSize: '0.8rem', fontWeight: 700 }}>→</span>
              )}
            </div>
          ))}
        </div>
        <span
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.75rem',
            color: '#8A9BB5',
            marginLeft: 'auto',
          }}
        >
          Constitutional invariant · No bypass permitted
        </span>
      </div>

      {/* ── Flywheel Diagram ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2
          className="section-label mb-5"
          style={{ color: '#8A9BB5' }}
        >
          The Sovereign Flywheel
        </h2>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
        >
          {flywheelSteps.map((step) => {
            const colors: Record<string, string> = {
              L1: '#C9A227', L2: '#7A5CFF', L3: '#00C2FF', AI: '#00F0B5',
            };
            const color = colors[step.layer] ?? '#8A9BB5';

            return (
              <div
                key={step.step}
                className="rounded-md p-4 flex gap-3"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: 'Orbitron, system-ui, sans-serif',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color,
                    opacity: 0.5,
                    flexShrink: 0,
                    lineHeight: 1,
                    paddingTop: 2,
                  }}
                >
                  {step.step}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <LayerBadge layer={step.layer} showDot={false} size="sm" />
                    <span
                      style={{
                        fontFamily: 'Sora, system-ui, sans-serif',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: '#E8EDF5',
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                  <p
                    className="section-label"
                    style={{ fontSize: '0.65rem', color: '#8A9BB5', marginTop: 2 }}
                  >
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Dashboard Sections Grid ──────────────────────────────────────── */}
      <section>
        <h2 className="section-label mb-5" style={{ color: '#8A9BB5' }}>
          Dashboard Modules
        </h2>

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
          {econSections.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div
                className="sovereign-card group"
                style={{
                  borderColor: item.border,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = item.color + '55';
                  el.style.boxShadow = `0 8px 32px rgba(0,0,0,0.3), 0 0 20px ${item.color}18`;
                  el.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = item.border;
                  el.style.boxShadow = '';
                  el.style.transform = '';
                }}
              >
                {/* Layer accent top bar */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, ${item.color}, transparent)`,
                  }}
                />

                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <LayerBadge layer={item.layer} showDot />
                    <span
                      style={{
                        fontFamily: 'Sora, system-ui, sans-serif',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: item.color,
                      }}
                    >
                      {item.name}
                    </span>
                  </div>
                  <span style={{ color: item.color, fontSize: '0.8rem', opacity: 0.6 }}>→</span>
                </div>

                {/* Role */}
                <p className="section-label mb-2" style={{ color: item.color, opacity: 0.7 }}>
                  {item.role}
                </p>

                {/* Description */}
                <p
                  style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '0.78rem',
                    color: '#8A9BB5',
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Footer Doctrine ──────────────────────────────────────────────── */}
      <div
        className="mt-12 pt-6 flex items-center justify-between flex-wrap gap-4"
        style={{ borderTop: '1px solid rgba(122,92,255,0.1)' }}
      >
        <div>
          <p
            style={{
              fontFamily: 'Orbitron, system-ui, sans-serif',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: '#7A5CFF',
              textTransform: 'uppercase',
            }}
          >
            GhostStack
          </p>
          <p className="section-label mt-1" style={{ color: '#8A9BB5' }}>
            Autonomy Secured.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#00F0B5',
              boxShadow: '0 0 6px rgba(0,240,181,0.6)',
              display: 'inline-block',
            }}
          />
          <span className="section-label" style={{ color: '#00F0B5' }}>
            SOVEREIGN ENGINE ACTIVE
          </span>
        </div>
      </div>
    </main>
  );
}
