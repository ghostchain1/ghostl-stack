import Link from 'next/link';
import { GhostWordmark } from '@/components/brand/GhostMark';
import { LayerBadge } from '@/components/brand/LayerBadge';

// ── Ecosystem product table ───────────────────────────────────────────────
const ecosystemProducts = [
  { layer: 'L1' as const,  name: 'GhostChain',         role: 'Sovereign Settlement & Treasury',   color: '#C9A227' },
  { layer: 'L2' as const,  name: 'GhostL2',            role: 'Liquidity & Exchange Layer',         color: '#7A5CFF' },
  { layer: 'L3' as const,  name: 'GhostL3',            role: 'Utility & Application Layer',        color: '#00C2FF' },
  { layer: 'AI' as const,  name: 'Hyper Ghost AI',     role: 'Autonomous Governance & Routing',    color: '#00F0B5' },
  { layer: 'L2' as const,  name: 'GhostXchange',       role: 'L2 Trading Engine',                  color: '#7A5CFF' },
  { layer: 'L1' as const,  name: 'Ghost Treasury',     role: 'Buyback · Burns · Allocation',       color: '#C9A227' },
  { layer: 'L3' as const,  name: 'GhostWallet',        role: 'Identity & Asset Control',           color: '#00C2FF' },
  { layer: 'AI' as const,  name: 'GhostLoad AI',       role: 'Gas Optimization & Load Balancing',  color: '#00F0B5' },
  { layer: 'AI' as const,  name: 'GhostDNS AI',        role: 'Network Intelligence & Routing',     color: '#00F0B5' },
  { layer: 'SEC' as const, name: 'GhostSentinel',      role: 'AI Threat Detection & Security',     color: '#FF3B3B' },
];

// ── Brand pillars ─────────────────────────────────────────────────────────
const pillars = [
  {
    icon: '🧠',
    title: 'Intelligence at Consensus',
    body: 'AI governs routing, treasury allocation, gas equilibrium, and security — as a first-class protocol participant, not an external tool.',
    color: '#00F0B5',
  },
  {
    icon: '📜',
    title: 'Constitutional Architecture',
    body: 'Every governance action traverses invariant-enforced execution paths. No EOA authority. No emergency withdrawals. Policy ambiguity fails closed.',
    color: '#C9A227',
  },
  {
    icon: '🌐',
    title: 'Layered Sovereignty',
    body: 'L3 Applications → L2 Liquidity → L1 Treasury. Hard routing law enforced at the contract level. No bypass. No fragmentation.',
    color: '#7A5CFF',
  },
  {
    icon: '⚡',
    title: 'Energy Efficiency',
    body: 'AI-optimized batching, routing, and validator equilibrium. GhostLoad AI continuously rebalances load to minimize energy per transaction.',
    color: '#00C2FF',
  },
];

// ── Whitepaper problems ───────────────────────────────────────────────────
const problems = [
  {
    id: '2.1',
    title: 'Gas Volatility',
    stat: '10,000%+',
    statLabel: 'gas spike during peak demand',
    body: 'Gas pricing in current systems is fundamentally reactive. Base fee algorithms respond to congestion after it occurs. GhostStack treats gas equilibrium as an AI optimization problem — continuously modeled, predicted, and adjusted before congestion occurs.',
    color: '#FF3B3B',
  },
  {
    id: '2.2',
    title: 'Fragmented Liquidity',
    stat: '$2.5B+',
    statLabel: 'lost to bridge exploits industry-wide',
    body: 'Liquidity is scattered across hundreds of chains, bridges, and DEXs. GhostStack addresses this architecturally: L2 is the canonical liquidity layer, and all L3 activity routes through it. Liquidity concentrates by design, not by incentive.',
    color: '#C9A227',
  },
  {
    id: '2.3',
    title: 'Governance Capture',
    stat: '100s of $M',
    statLabel: 'lost to governance attacks',
    body: 'Token-weighted governance is vulnerable to capture by large holders. Constitutional invariants — enforced at the smart contract level — cannot be overridden by governance votes. GhostStack\'s governance system cannot bypass treasury invariants or grant unilateral authority.',
    color: '#7A5CFF',
  },
  {
    id: '2.4',
    title: 'Validator Misalignment',
    stat: 'Narrow',
    statLabel: 'slashing conditions across major chains',
    body: 'Validator incentives in most systems are misaligned with long-term protocol health. GhostStack\'s validator governance is constitutionally enforced: minimum staking thresholds, multi-region quorum, automated quarantine, and AI-monitored performance metrics.',
    color: '#00C2FF',
  },
  {
    id: '2.5',
    title: 'Energy Inefficiency',
    stat: 'AI-Optimized',
    statLabel: 'batch sizes, gas targets, validator load',
    body: 'Even proof-of-stake systems are inefficient: validators run at full capacity regardless of network load. GhostStack\'s AI layer continuously optimizes batch sizes, gas targets, and validator load distribution to minimize energy expenditure per unit of economic activity.',
    color: '#00F0B5',
  },
];

// ── Roadmap phases ────────────────────────────────────────────────────────
const roadmapPhases = [
  { phase: 'Phase 0', label: 'Genesis', quarter: 'Q1 2026', status: 'complete' as const, items: ['L1 GhostChain deployment', 'L2 OP Stack integration', 'GST genesis allocation', 'Constitutional contracts'] },
  { phase: 'Phase 1', label: 'Foundation', quarter: 'Q2 2026', status: 'active' as const,   items: ['L3 utility layer', 'GhostXchange beta', 'GhostWallet identity', 'ZK solvency proofs'] },
  { phase: 'Phase 2', label: 'Growth',    quarter: 'Q3 2026', status: 'upcoming' as const, items: ['SDK ecosystem launch', 'Multi-region validators', 'AI advisory layer live', 'Governance ratification'] },
  { phase: 'Phase 3', label: 'Scale',     quarter: 'Q4 2026', status: 'upcoming' as const, items: ['Enterprise integrations', 'Cross-federation bridge', 'Full AI autonomy', 'Exchange listings'] },
];

// ── Federation entities ───────────────────────────────────────────────────
const federationEntities = [
  { name: 'GhostStack Foundation',         role: 'Constitutional Oversight & Governance Ratification' },
  { name: 'GhostStack Labs',               role: 'AI Research & Protocol R&D' },
  { name: 'GhostStack Treasury Authority', role: 'Economic Stability & Allocation Governance' },
  { name: 'Ghost Federation Council',      role: 'Validator Coordination & Slashing Governance' },
  { name: 'Ghost Sovereign Network',       role: 'Global Node Infrastructure' },
];

// ── Shared style helpers ──────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: '#8A9BB5',
  textTransform: 'uppercase',
  marginBottom: 12,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: 'Orbitron, system-ui, sans-serif',
  fontSize: 'clamp(1.4rem, 3vw, 2rem)',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: '#E8EDF5',
  textTransform: 'uppercase',
  marginBottom: 16,
};

export default function GhostStackLandingPage() {
  return (
    <div style={{ background: '#0B0F14', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Sticky Nav ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(11,15,20,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(122,92,255,0.12)',
        padding: '0 32px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <GhostWordmark size={28} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {[
            { href: '#problems',                  label: 'Problems'    },
            { href: '#architecture',              label: 'Architecture' },
            { href: '#federation',                label: 'Federation'   },
            { href: '#token',                     label: '$GST'          },
            { href: '/ghoststack/whitepaper',     label: 'Whitepaper'  },
            { href: '/econ/financials',           label: 'Financials'  },
            { href: '/econ',                      label: 'Dashboard'   },
          ].map((item) => (
            <a key={item.href} href={item.href} style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '0.8rem', fontWeight: 500,
              color: '#8A9BB5', letterSpacing: '0.06em', textDecoration: 'none',
            }}>
              {item.label}
            </a>
          ))}
          <Link href="/econ" style={{
            background: 'linear-gradient(135deg, #7A5CFF, #5A3CDF)',
            color: '#E8EDF5', padding: '8px 18px', borderRadius: 8,
            fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
          }}>
            Launch App
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(80px, 12vw, 140px) 32px clamp(60px, 8vw, 100px)',
        maxWidth: 1100, margin: '0 auto', textAlign: 'center', position: 'relative',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 300,
          background: 'radial-gradient(ellipse, rgba(122,92,255,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Category pill */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 14px',
            background: 'rgba(122,92,255,0.1)', border: '1px solid rgba(122,92,255,0.3)',
            borderRadius: 999, fontSize: '0.7rem', fontWeight: 600,
            letterSpacing: '0.12em', color: '#7A5CFF', textTransform: 'uppercase',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00F0B5', boxShadow: '0 0 6px rgba(0,240,181,0.6)', display: 'inline-block' }} />
            AI-Governed Sovereign Multichain Infrastructure
          </span>
        </div>

        <h1 style={{
          fontFamily: 'Orbitron, system-ui, sans-serif',
          fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700,
          letterSpacing: '0.06em', lineHeight: 1.1,
          color: '#E8EDF5', textTransform: 'uppercase', marginBottom: 24,
        }}>
          Sovereign Infrastructure<br />
          <span style={{ color: '#7A5CFF' }}>for the Autonomous Era.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(0.9rem, 1.5vw, 1.05rem)', color: '#8A9BB5',
          maxWidth: 620, margin: '0 auto 40px', lineHeight: 1.7,
        }}>
          GhostStack is an AI-governed multichain federation engineered for constitutional
          governance, energy-efficient consensus, and long-horizon digital sovereignty.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#architecture" style={{
            background: 'linear-gradient(135deg, #7A5CFF, #5A3CDF)',
            color: '#E8EDF5', padding: '14px 28px', borderRadius: 10,
            fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
          }}>
            Explore the Architecture
          </a>
          <Link href="/econ" style={{
            background: 'rgba(255,255,255,0.05)', color: '#E8EDF5',
            padding: '14px 28px', borderRadius: 10,
            fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
            border: '1px solid rgba(122,92,255,0.3)',
          }}>
            Open Dashboard
          </Link>
        </div>

        {/* Layer status row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 48, flexWrap: 'wrap' }}>
          {(['L1', 'L2', 'L3', 'AI', 'SEC'] as const).map((layer) => (
            <LayerBadge key={layer} layer={layer} showDot />
          ))}
        </div>
      </section>

      {/* ── Problems ─────────────────────────────────────────────────────── */}
      <section id="problems" style={{
        padding: 'clamp(60px, 8vw, 100px) 32px',
        background: 'rgba(255,59,59,0.02)',
        borderTop: '1px solid rgba(255,59,59,0.06)',
        borderBottom: '1px solid rgba(255,59,59,0.06)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={sectionLabel}>The Problem</p>
            <h2 style={sectionHeading}>Reactive Systems. Structural Failures.</h2>
            <p style={{ color: '#8A9BB5', fontSize: '0.9rem', maxWidth: 580, margin: '0 auto', lineHeight: 1.7 }}>
              The history of blockchain governance is a history of reactive design. GhostStack inverts every pattern that has historically failed.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {problems.map((problem) => (
              <div key={problem.id} style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${problem.color}22`,
                borderLeft: `3px solid ${problem.color}`,
                borderRadius: 10, padding: '20px 22px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, color: '#8A9BB5', letterSpacing: '0.12em' }}>§{problem.id}</span>
                  <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: problem.color }}>{problem.title}</span>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, color: problem.color }}>{problem.stat}</span>
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5', marginLeft: 6 }}>{problem.statLabel}</span>
                </div>
                <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.75rem', color: '#8A9BB5', lineHeight: 1.65, margin: 0 }}>{problem.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Architecture ─────────────────────────────────────────────────── */}
      <section id="architecture" style={{ padding: 'clamp(60px, 8vw, 100px) 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={sectionLabel}>Architecture</p>
          <h2 style={sectionHeading}>Structured by Design.</h2>
          <p style={{ color: '#8A9BB5', fontSize: '0.9rem', maxWidth: 500, margin: '0 auto' }}>
            Three layers. One constitution. AI-coordinated governance across the entire stack.
          </p>
        </div>

        {/* Layer stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 700, margin: '0 auto 56px' }}>
          {[
            { layer: 'L3' as const, name: 'GhostL3',    role: 'Utility & Application Layer',      items: 'SDKs · dApps · NFTs · Payments · Streaming · APIs',                    color: '#00C2FF', bg: 'rgba(0,194,255,0.06)'   },
            { layer: 'L2' as const, name: 'GhostL2',    role: 'Liquidity & Exchange Layer',        items: 'GhostXchange · Liquidity Pools · Launchpad · Bridges',                 color: '#7A5CFF', bg: 'rgba(122,92,255,0.06)'  },
            { layer: 'L1' as const, name: 'GhostChain', role: 'Sovereign Settlement & Treasury',   items: 'Governor · TreasuryVault · AllocationScheduler · Yield Engine',         color: '#C9A227', bg: 'rgba(201,162,39,0.06)'  },
          ].map((item, i) => (
            <div key={item.layer}>
              <div style={{
                background: item.bg, border: `1px solid ${item.color}33`,
                borderRadius: 12, padding: '20px 24px', position: 'relative',
              }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: item.color, borderRadius: '12px 0 0 12px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <LayerBadge layer={item.layer} showDot />
                  <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1rem', fontWeight: 600, color: item.color }}>{item.name}</span>
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5' }}>— {item.role}</span>
                </div>
                <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.75rem', color: '#8A9BB5', margin: 0 }}>{item.items}</p>
              </div>
              {i < 2 && (
                <div style={{ textAlign: 'center', padding: '6px 0', color: '#7A5CFF', fontSize: '1rem', fontWeight: 700 }}>↓</div>
              )}
            </div>
          ))}
        </div>

        {/* Brand pillars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {pillars.map((pillar) => (
            <div key={pillar.title} style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '20px',
            }}>
              <div style={{ fontSize: '1.4rem', marginBottom: 10 }}>{pillar.icon}</div>
              <h3 style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: pillar.color, marginBottom: 8 }}>{pillar.title}</h3>
              <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem', color: '#8A9BB5', lineHeight: 1.6, margin: 0 }}>{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI Section ───────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(60px, 8vw, 100px) 32px',
        background: 'rgba(0,240,181,0.03)',
        borderTop: '1px solid rgba(0,240,181,0.08)',
        borderBottom: '1px solid rgba(0,240,181,0.08)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <LayerBadge layer="AI" showDot size="md" />
          <h2 style={{ ...sectionHeading, margin: '16px 0' }}>Intelligence at Consensus.</h2>
          <p style={{ color: '#8A9BB5', fontSize: '0.9rem', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.7 }}>
            Hyper Ghost AI operates as a first-class protocol participant — governing routing,
            treasury allocation, gas equilibrium, and validator orchestration. Not a feature. A protocol primitive.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, maxWidth: 900, margin: '0 auto' }}>
            {[
              { name: 'GhostLoad AI',  role: 'Gas Optimization'    },
              { name: 'GhostDNS AI',   role: 'Network Routing'     },
              { name: 'Treasury AI',   role: 'Capital Allocation'  },
              { name: 'GhostSentinel', role: 'Threat Detection'    },
            ].map((ai) => (
              <div key={ai.name} style={{
                background: 'rgba(0,240,181,0.06)', border: '1px solid rgba(0,240,181,0.15)',
                borderRadius: 10, padding: '16px', textAlign: 'left',
              }}>
                <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: '#00F0B5', marginBottom: 4 }}>{ai.name}</div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5', letterSpacing: '0.06em' }}>{ai.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Federation ───────────────────────────────────────────────────── */}
      <section id="federation" style={{ padding: 'clamp(60px, 8vw, 100px) 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={sectionLabel}>The Ghost Federation</p>
          <h2 style={sectionHeading}>Built for Global Scale.</h2>
          <p style={{ color: '#8A9BB5', fontSize: '0.9rem', maxWidth: 560, margin: '0 auto' }}>
            A Sovereign Multichain Federation governed by AI, enforced by constitutional smart contracts,
            and structured for digital nation-scale infrastructure.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {federationEntities.map((entity) => (
            <div key={entity.name} style={{
              background: 'rgba(122,92,255,0.05)', border: '1px solid rgba(122,92,255,0.15)',
              borderRadius: 10, padding: '18px 20px',
            }}>
              <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.88rem', fontWeight: 600, color: '#7A5CFF', marginBottom: 6 }}>{entity.name}</div>
              <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.75rem', color: '#8A9BB5', lineHeight: 1.5 }}>{entity.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Token ────────────────────────────────────────────────────────── */}
      <section id="token" style={{
        padding: 'clamp(60px, 8vw, 100px) 32px',
        background: 'rgba(201,162,39,0.03)',
        borderTop: '1px solid rgba(201,162,39,0.08)',
        borderBottom: '1px solid rgba(201,162,39,0.08)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <LayerBadge layer="L1" showDot size="md" />
          <h2 style={{ ...sectionHeading, margin: '16px 0' }}>$GST — Ghost Sovereign Token</h2>
          <p style={{ color: '#8A9BB5', fontSize: '0.9rem', maxWidth: 500, margin: '0 auto 40px', lineHeight: 1.7 }}>
            GST powers governance, security, liquidity, and burn equilibrium across the entire Ghost Federation.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, maxWidth: 800, margin: '0 auto' }}>
            {[
              { label: 'Gas',        desc: 'Native gas across L1/L2/L3'          },
              { label: 'Governance', desc: 'Voting weight in protocol decisions'  },
              { label: 'Staking',    desc: 'Validator collateral & delegation'    },
              { label: 'Burn',       desc: 'Protocol fee burn each epoch'         },
              { label: 'Buyback',    desc: 'Treasury yield → GST buyback'         },
            ].map((item) => (
              <div key={item.label} style={{
                background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.2)',
                borderRadius: 10, padding: '16px',
              }}>
                <div style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.72rem', fontWeight: 700, color: '#C9A227', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ecosystem Stack ──────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={sectionLabel}>Ecosystem</p>
          <h2 style={sectionHeading}>The Ghost Federation Stack</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {ecosystemProducts.map((product) => (
            <div key={product.name} style={{
              background: 'rgba(255,255,255,0.02)', border: `1px solid ${product.color}22`,
              borderRadius: 10, padding: '14px 16px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <LayerBadge layer={product.layer} showDot={false} size="sm" />
              <div>
                <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: product.color, marginBottom: 3 }}>{product.name}</div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.7rem', color: '#8A9BB5' }}>{product.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Roadmap ──────────────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px, 8vw, 100px) 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p style={sectionLabel}>Roadmap</p>
          <h2 style={sectionHeading}>Phased Execution.</h2>
          <p style={{ color: '#8A9BB5', fontSize: '0.9rem', maxWidth: 480, margin: '0 auto' }}>
            Each phase builds on constitutional foundations laid at genesis. No governance retroactivity. No shortcuts.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {roadmapPhases.map((phase) => {
            const statusColor = phase.status === 'complete' ? '#00F0B5' : phase.status === 'active' ? '#7A5CFF' : '#8A9BB5';
            const bg = phase.status === 'complete' ? 'rgba(0,240,181,0.05)' : phase.status === 'active' ? 'rgba(122,92,255,0.07)' : 'rgba(255,255,255,0.02)';
            return (
              <div key={phase.phase} style={{ background: bg, border: `1px solid ${statusColor}22`, borderRadius: 12, padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.62rem', fontWeight: 700, color: statusColor, letterSpacing: '0.1em' }}>{phase.phase}</span>
                  <span style={{
                    fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: phase.status === 'complete' ? '#00F0B5' : phase.status === 'active' ? '#7A5CFF' : '#8A9BB5',
                    background: `${statusColor}15`, padding: '2px 7px', borderRadius: 4,
                  }}>
                    {phase.status === 'complete' ? '✓ Complete' : phase.status === 'active' ? '◉ Live' : '○ Upcoming'}
                  </span>
                </div>
                <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#E8EDF5', marginBottom: 2 }}>{phase.label}</div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5', marginBottom: 12 }}>{phase.quarter}</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {phase.items.map((item) => (
                    <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5' }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA Footer ───────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(80px, 10vw, 120px) 32px',
        textAlign: 'center',
        borderTop: '1px solid rgba(122,92,255,0.1)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 200,
          background: 'radial-gradient(ellipse, rgba(122,92,255,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <GhostWordmark size={40} showTagline />
        </div>

        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.9rem', color: '#8A9BB5', maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.7 }}>
          The infrastructure for the autonomous era is being built.
          <br />
          <strong style={{ color: '#E8EDF5' }}>Join the Ghost Federation.</strong>
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/econ" style={{
            background: 'linear-gradient(135deg, #7A5CFF, #5A3CDF)',
            color: '#E8EDF5', padding: '14px 32px', borderRadius: 10,
            fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
          }}>
            Open Dashboard
          </Link>
          <Link href="/econ/governance" style={{
            background: 'rgba(201,162,39,0.1)', color: '#C9A227',
            padding: '14px 32px', borderRadius: 10,
            fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
            border: '1px solid rgba(201,162,39,0.3)',
          }}>
            View Governance
          </Link>
        </div>

        {/* Doctrine */}
        <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          {['Governance is code.', 'Intelligence is enforced.', 'Sovereignty is engineered.'].map((line) => (
            <p key={line} style={{
              fontFamily: 'Orbitron, system-ui, sans-serif',
              fontSize: '0.72rem', fontWeight: 600,
              letterSpacing: '0.1em', color: '#8A9BB5',
              textTransform: 'uppercase', margin: 0,
            }}>
              {line}
            </p>
          ))}
        </div>

        {/* Footer bar */}
        <div style={{
          marginTop: 48, paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
          fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5',
        }}>
          <span>© 2026 GhostStack Foundation. All rights reserved.</span>
          <span style={{ letterSpacing: '0.08em' }}>AUTONOMY SECURED.</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link href="/ghoststack/whitepaper" style={{ color: '#8A9BB5', textDecoration: 'none' }}>Whitepaper</Link>
            <Link href="/econ/financials" style={{ color: '#8A9BB5', textDecoration: 'none' }}>Financials</Link>
            <Link href="/econ" style={{ color: '#8A9BB5', textDecoration: 'none' }}>Dashboard</Link>
            <Link href="/econ/governance" style={{ color: '#8A9BB5', textDecoration: 'none' }}>Governance</Link>
            <Link href="/econ/treasury" style={{ color: '#8A9BB5', textDecoration: 'none' }}>Treasury</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
