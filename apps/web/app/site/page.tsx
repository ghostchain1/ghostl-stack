import type { Metadata } from 'next';
import Link from 'next/link';
import { LayerBadge } from '@/components/brand/LayerBadge';
import { PublicNav, PublicFooter } from './_components/PublicNav';

export const metadata: Metadata = {
  title: 'GhostStack — Autonomy Secured.',
  description: 'GhostStack is an AI-governed sovereign multichain federation. Constitutional governance, energy-efficient consensus, and long-horizon digital sovereignty.',
};

/* ── Shared styles ────────────────────────────────────────────────────── */
const S = {
  page:    { background: '#070B10', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  section: { maxWidth: 1200, margin: '0 auto', padding: 'clamp(72px,10vw,110px) clamp(16px,4vw,48px)' } as React.CSSProperties,
  cap:     { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', color: '#7A5CFF', textTransform: 'uppercase' as const, marginBottom: 10 } as React.CSSProperties,
  overline:{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', color: '#8A9BB5', textTransform: 'uppercase' as const, marginBottom: 12 } as React.CSSProperties,
  h2:      { fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.4rem,3vw,2.1rem)', fontWeight: 700, letterSpacing: '0.05em', color: '#E8EDF5', textTransform: 'uppercase' as const, marginBottom: 14, marginTop: 0 } as React.CSSProperties,
  body:    { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.88rem', color: '#8A9BB5', lineHeight: 1.75 } as React.CSSProperties,
  mono:    { fontFamily: 'JetBrains Mono, monospace' } as React.CSSProperties,
  divider: { borderTop: '1px solid rgba(255,255,255,0.05)', margin: 0 } as React.CSSProperties,
};

/* ── Data ─────────────────────────────────────────────────────────────── */
const telemetry = [
  { label: 'Block Height',   value: '2,847,331', color: '#00F0B5', unit: '' },
  { label: 'Block Time',     value: '1.9',       color: '#00C2FF', unit: 's' },
  { label: 'Active Validators', value: '127',    color: '#7A5CFF', unit: '' },
  { label: 'Network Load',   value: '38',        color: '#C9A227', unit: '%' },
  { label: 'Epoch Burn',     value: '2.00',      color: '#FF3B3B', unit: '%' },
  { label: 'Reserve Ratio',  value: '24.7',      color: '#00F0B5', unit: '%' },
  { label: 'AI Systems',     value: '4/4',       color: '#00F0B5', unit: '' },
  { label: 'TPS (L3)',       value: '4,200',     color: '#00C2FF', unit: '' },
];

const layers = [
  {
    layer: 'AI' as const, name: 'Hyper Ghost AI', color: '#00F0B5', glow: 'rgba(0,240,181,0.15)',
    role: 'Intelligence & Optimization',
    systems: ['GhostLoad AI', 'GhostDNS AI', 'Treasury AI', 'GhostSentinel'],
    desc: 'First-class protocol participant. Gas optimization, routing intelligence, capital allocation, threat detection — all on-chain.',
    stat: '4 SUBSYSTEMS ONLINE',
  },
  {
    layer: 'L3' as const, name: 'GhostL3', color: '#00C2FF', glow: 'rgba(0,194,255,0.15)',
    role: 'Utility & Application Execution',
    systems: ['dApp Runtime', 'SDK Access', 'AI Gas Mgr', 'ZK Batching'],
    desc: 'OP Stack-compatible execution layer. Sub-cent fees. AI-batched transactions. Full EVM compatibility for 10,000+ dApps.',
    stat: '4,200 TPS ACTIVE',
  },
  {
    layer: 'L2' as const, name: 'GhostL2', color: '#7A5CFF', glow: 'rgba(122,92,255,0.15)',
    role: 'Liquidity & Exchange Layer',
    systems: ['GhostXchange', 'Liquidity Pools', 'Launchpad', 'Bridges'],
    desc: 'Canonical liquidity concentration. All L3 fees route here first by constitutional law. AMM + order book hybrid.',
    stat: '$127M TVL LOCKED',
  },
  {
    layer: 'L1' as const, name: 'GhostChain', color: '#C9A227', glow: 'rgba(201,162,39,0.15)',
    role: 'Sovereign Settlement & Treasury',
    systems: ['TreasuryVault', 'GhostGovernor', 'RiskOracle', 'PolicyGate'],
    desc: 'IBFT 2.0 consensus. All constitutional contracts deployed here. Final settlement. Governance ratification. Treasury management.',
    stat: '≥20% RESERVE HELD',
  },
];

const pillars = [
  { col: '#00F0B5', title: 'Intelligence at Consensus',  id: 'AI',  body: 'Hyper Ghost AI operates as a first-class constitutional actor. Gas equilibrium, routing, treasury, and threat response — governed by code.' },
  { col: '#C9A227', title: 'Constitutional Architecture', id: 'GOV', body: 'Six hard invariants enforced at genesis. No EOA authority. Ambiguity fails closed. Upgrades require supermajority + timelock.' },
  { col: '#7A5CFF', title: 'Layered Sovereignty',        id: 'ARC', body: 'L3 → L2 → L1. Hard routing law at the contract level. Fee concentration by law. No bypass. No fragmentation.' },
  { col: '#00C2FF', title: 'Energy Efficiency',          id: 'EFF', body: 'GhostLoad AI continuously minimizes compute per transaction. Validators balanced across regions. No idle capacity waste.' },
  { col: '#FF3B3B', title: 'Security by Invariant',      id: 'SEC', body: 'GhostSentinel AI monitors every block. Constitutional quarantine for misbehaving validators. Formal verification standard.' },
  { col: '#C9A227', title: 'Closed-Loop Economics',      id: 'ECO', body: 'L3 fees → L2 → L1 treasury → yield → buyback/burn/rewards → growth. Self-compounding deflationary flywheel from Year 1.' },
];

const audiences = [
  {
    id: 'USR', href: '/site/users', color: '#00C2FF', bg: 'rgba(0,194,255,0.05)', border: 'rgba(0,194,255,0.18)',
    title: 'For Users', tagline: 'Your keys. Your chain. Your sovereignty.',
    items: ['GhostWallet — sovereign identity & custody', 'GhostXchange — AI-optimized L2 DEX', 'Sub-cent L3 transactions, AI-batched', 'ZK-proven treasury transparency', 'dApp ecosystem on GhostL3'],
    cta: 'Explore →',
  },
  {
    id: 'INV', href: '/site/investors', color: '#C9A227', bg: 'rgba(201,162,39,0.05)', border: 'rgba(201,162,39,0.18)',
    title: 'For Investors', tagline: 'Closed-loop sovereign economic engine.',
    items: ['5Y bull: $8.29B · base: $787M · bear: $24.7M', 'Net-deflationary from Year 1 (Base)', 'Treasury self-sustaining by Year 2', '1B GST genesis · no additional mint', 'Constitutional reserve floor ≥ 20%'],
    cta: 'Investor Relations →',
  },
  {
    id: 'DEV', href: '/site/developers', color: '#7A5CFF', bg: 'rgba(122,92,255,0.05)', border: 'rgba(122,92,255,0.18)',
    title: 'For Developers', tagline: 'Build on a constitutionally governed chain.',
    items: ['GhostL3 — OP Stack-compatible, AI load-balanced', 'Transparent fee model, no surprises', 'Constitutional plugin framework — auditable', 'GhostDNS AI — intelligent peer routing', 'Formal verification-first environment'],
    cta: 'Start Building →',
  },
];

const timeline = [
  { q: 'Q1 2026', label: 'Genesis',    s: 'complete', items: ['L1 GhostChain live', 'GST genesis supply', 'Constitutional contracts', 'L2 OP Stack integrated'] },
  { q: 'Q2 2026', label: 'Foundation', s: 'active',   items: ['L3 utility layer', 'GhostWallet identity', 'GhostXchange beta', 'ZK solvency proofs'] },
  { q: 'Q3 2026', label: 'Growth',     s: 'upcoming', items: ['SDK ecosystem release', 'Multi-region validators', 'AI governance live', 'Exchange listings'] },
  { q: 'Q4 2026', label: 'Scale',      s: 'upcoming', items: ['Enterprise integrations', 'Cross-federation bridges', 'Full AI autonomy', 'Global node expansion'] },
];

const gstStats = [
  { label: 'Genesis Supply', value: '1,000,000,000', unit: 'GST',     color: '#C9A227' },
  { label: 'Base Burn Rate', value: '2.00',          unit: '%/epoch', color: '#FF3B3B' },
  { label: 'Reserve Floor',  value: '≥ 20',          unit: '%',       color: '#00F0B5' },
  { label: 'Buyback Rate',   value: '15',             unit: '% surplus', color: '#7A5CFF' },
  { label: '5Y Bull Rev',    value: '$8.29',          unit: 'B',       color: '#C9A227' },
  { label: '5Y Base Rev',    value: '$787',           unit: 'M',       color: '#8A9BB5' },
];

export default function SiteHomePage() {
  return (
    <div style={S.page}>
      <PublicNav />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: '92vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* Grid background */}
        <div className="gs-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />
        {/* Scan line */}
        <div className="gs-scan-line" style={{ position: 'absolute', inset: 0 }} />
        {/* Radial glows */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '-5%',  left: '50%', transform: 'translateX(-50%)', width: 1000, height: 600, background: 'radial-gradient(ellipse, rgba(122,92,255,0.14) 0%, transparent 60%)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', top: '40%',  left: '8%',  width: 400, height: 350, background: 'radial-gradient(ellipse, rgba(0,240,181,0.07) 0%, transparent 65%)' }} />
          <div style={{ position: 'absolute', top: '20%',  right: '5%', width: 350, height: 280, background: 'radial-gradient(ellipse, rgba(201,162,39,0.08) 0%, transparent 65%)' }} />
        </div>

        <div style={{ ...S.section, textAlign: 'center', position: 'relative', paddingTop: 'clamp(80px,12vw,130px)', paddingBottom: 'clamp(64px,10vw,100px)' }}>
          {/* Status badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 18px', borderRadius: 999, background: 'rgba(0,240,181,0.06)', border: '1px solid rgba(0,240,181,0.22)' }}>
              <span className="gs-dot-teal" style={{ width: 7, height: 7, borderRadius: '50%', background: '#00F0B5', display: 'inline-block' }} />
              <span style={{ ...S.mono, fontSize: '0.62rem', fontWeight: 700, color: '#00F0B5', letterSpacing: '0.15em' }}>LIVE · PHASE 2 — FOUNDATION</span>
              <span style={{ ...S.mono, fontSize: '0.58rem', color: '#4A5568', letterSpacing: '0.1em' }}>BLOCK #2,847,331</span>
            </div>
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: 'clamp(2.4rem, 6.5vw, 5rem)', fontWeight: 700,
            letterSpacing: '0.02em', lineHeight: 1.0, color: '#E8EDF5',
            textTransform: 'uppercase', marginBottom: 20,
          }}>
            Sovereign<br />
            <span style={{ color: '#7A5CFF', textShadow: '0 0 80px rgba(122,92,255,0.5)' }}>Infrastructure</span><br />
            <span style={{ fontSize: '0.6em', color: '#8A9BB5', letterSpacing: '0.08em' }}>for the Autonomous Era.</span>
          </h1>

          <p style={{ ...S.body, maxWidth: 600, margin: '0 auto 44px', fontSize: '1rem', lineHeight: 1.8 }}>
            GhostStack is an AI-governed multichain federation engineered for constitutional governance,
            energy-efficient consensus, and long-horizon digital sovereignty.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
            <Link href="/site/users" className="gs-btn-primary" style={{ background: 'linear-gradient(135deg, #7A5CFF, #4A2CDF)', color: '#fff', padding: '14px 32px', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.05em', textDecoration: 'none', boxShadow: '0 0 40px rgba(122,92,255,0.35)' }}>
              Get Started
            </Link>
            <Link href="/site/investors" style={{ background: 'rgba(201,162,39,0.08)', color: '#C9A227', padding: '14px 32px', borderRadius: 10, fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.3)' }}>
              Investor Relations
            </Link>
            <Link href="/site/whitepaper" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '14px 32px', borderRadius: 10, fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.09)' }}>
              Whitepaper
            </Link>
          </div>

          {/* Layer badges */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(['L1', 'L2', 'L3', 'AI', 'SEC'] as const).map((l) => <LayerBadge key={l} layer={l} showDot />)}
          </div>
        </div>

        {/* Bottom fade */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(to bottom, transparent, #070B10)', pointerEvents: 'none' }} />
      </section>

      {/* ── LIVE TELEMETRY ─────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(0,240,181,0.1)', borderBottom: '1px solid rgba(0,240,181,0.1)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px clamp(16px,4vw,48px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span className="gs-dot-teal" style={{ width: 7, height: 7, borderRadius: '50%', background: '#00F0B5', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ ...S.mono, fontSize: '0.6rem', fontWeight: 700, color: '#00F0B5', letterSpacing: '0.18em' }}>LIVE NETWORK TELEMETRY</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(0,240,181,0.12)', display: 'inline-block' }} />
            <span style={{ ...S.mono, fontSize: '0.55rem', color: '#4A5568', letterSpacing: '0.1em' }}>GHOSTCHAIN L1 · Q2 2026</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {telemetry.map((t) => (
              <div key={t.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${t.color}60, transparent)` }} />
                <div style={{ ...S.mono, fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', fontWeight: 700, color: t.color, letterSpacing: '0.03em', lineHeight: 1 }}>
                  {t.value}<span style={{ fontSize: '0.55em', marginLeft: 2, color: `${t.color}99` }}>{t.unit}</span>
                </div>
                <div style={{ ...S.mono, fontSize: '0.55rem', color: '#4A5568', letterSpacing: '0.12em', marginTop: 6, textTransform: 'uppercase' }}>{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ARCHITECTURE STACK ────────────────────────────────────────── */}
      <section style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={S.cap}>System Architecture</p>
            <h2 style={S.h2}>Four Layers. One Constitution.</h2>
            <p style={{ ...S.body, maxWidth: 540, margin: '0 auto' }}>
              Every layer has a defined role. Every fee routes through the stack. Every action is constitutionally enforced.
            </p>
          </div>

          {/* Stack visualization */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 900, margin: '0 auto' }}>
            {layers.map((lyr, idx) => (
              <div key={lyr.name}>
                <div className="gs-hud gs-card-hover" style={{ background: `rgba(${lyr.color.slice(1).match(/.{2}/g)!.map(h => parseInt(h,16)).join(',')},0.05)`, border: `1px solid ${lyr.color}25`, borderRadius: 12, padding: '22px 28px', position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 24, alignItems: 'center' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: lyr.color, borderRadius: '12px 0 0 12px' }} />
                  {/* Layer ID */}
                  <div>
                    <LayerBadge layer={lyr.layer} showDot />
                    <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1.05rem', fontWeight: 700, color: lyr.color, marginTop: 8 }}>{lyr.name}</div>
                    <div style={{ ...S.mono, fontSize: '0.55rem', color: '#8A9BB5', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{lyr.role}</div>
                  </div>
                  {/* Description + tags */}
                  <div>
                    <p style={{ ...S.body, fontSize: '0.8rem', margin: '0 0 12px' }}>{lyr.desc}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {lyr.systems.map((s) => (
                        <span key={s} style={{ ...S.mono, fontSize: '0.62rem', color: lyr.color, background: `${lyr.color}10`, border: `1px solid ${lyr.color}20`, padding: '2px 8px', borderRadius: 4 }}>{s}</span>
                      ))}
                    </div>
                  </div>
                  {/* Stat */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...S.mono, fontSize: '0.58rem', fontWeight: 700, color: lyr.color, letterSpacing: '0.1em', background: `${lyr.color}12`, border: `1px solid ${lyr.color}25`, padding: '5px 10px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                      {lyr.stat}
                    </div>
                    <div style={{ ...S.mono, fontSize: '0.52rem', color: '#4A5568', marginTop: 5, letterSpacing: '0.08em' }}>OPERATIONAL</div>
                  </div>
                </div>
                {/* Arrow between layers */}
                {idx < layers.length - 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                    <span style={{ ...S.mono, fontSize: '0.58rem', color: '#7A5CFF', fontWeight: 700 }}>▼ FEE ROUTING</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Routing law bar */}
          <div style={{ maxWidth: 900, margin: '24px auto 0', padding: '14px 22px', background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ ...S.mono, fontSize: '0.58rem', color: '#8A9BB5', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>Constitutional Invariant I-01</span>
            {[{t:'GhostL3',c:'#00C2FF'},{t:'→',c:'#7A5CFF'},{t:'GhostL2',c:'#7A5CFF'},{t:'→',c:'#7A5CFF'},{t:'GhostChain L1',c:'#C9A227'}].map((x,i)=>(
              <span key={i} style={{ fontFamily: x.t==='→' ? 'JetBrains Mono, monospace' : 'Sora, system-ui, sans-serif', fontSize: x.t==='→' ? '1.1rem' : '0.85rem', fontWeight: 700, color: x.c }}>{x.t}</span>
            ))}
            <span style={{ marginLeft: 'auto', ...S.mono, fontSize: '0.55rem', color: '#FF3B3B', fontWeight: 700, letterSpacing: '0.1em' }}>L3→L1 DIRECT: FORBIDDEN</span>
          </div>
        </div>
      </section>

      {/* ── AUDIENCE ──────────────────────────────────────────────────── */}
      <section style={{ ...S.section }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <p style={S.cap}>Who It's For</p>
          <h2 style={S.h2}>Built for Everyone in the Federation.</h2>
          <p style={{ ...S.body, maxWidth: 520, margin: '0 auto' }}>
            GhostStack serves end users, institutional investors, and protocol developers — each with a dedicated product surface.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {audiences.map((a) => (
            <div key={a.id} className="gs-hud gs-card-hover" style={{ background: a.bg, border: `1px solid ${a.border}`, borderRadius: 14, padding: '28px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${a.color}50, transparent)` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ ...S.mono, fontSize: '0.6rem', fontWeight: 700, color: a.color, background: `${a.color}12`, border: `1px solid ${a.color}25`, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.12em' }}>{a.id}</span>
                <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: a.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{a.title}</span>
              </div>
              <p style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: '#E8EDF5', marginBottom: 18, lineHeight: 1.4 }}>{a.tagline}</p>
              <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {a.items.map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: a.color, flexShrink: 0, ...S.mono, fontSize: '0.75rem', marginTop: 1 }}>▸</span>
                    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.8rem', color: '#8A9BB5', lineHeight: 1.5 }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href={a.href} style={{ display: 'block', background: `${a.color}16`, color: a.color, padding: '10px 20px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.05em', textDecoration: 'none', border: `1px solid ${a.color}30`, textAlign: 'center' }}>
                {a.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── PILLARS ────────────────────────────────────────────────────── */}
      <section style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={S.cap}>Why GhostStack</p>
            <h2 style={S.h2}>Every Failure Mode — Solved at Genesis.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {pillars.map((p) => (
              <div key={p.id} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${p.col}, transparent)` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ ...S.mono, fontSize: '0.55rem', fontWeight: 700, color: p.col, background: `${p.col}12`, border: `1px solid ${p.col}25`, padding: '2px 7px', borderRadius: 3, letterSpacing: '0.1em' }}>{p.id}</span>
                </div>
                <h3 style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.92rem', fontWeight: 700, color: p.col, marginBottom: 10, marginTop: 0 }}>{p.title}</h3>
                <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem', color: '#8A9BB5', lineHeight: 1.7, margin: 0 }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── $GST ECONOMICS ─────────────────────────────────────────────── */}
      <section style={{ ...S.section }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
          <div>
            <p style={S.cap}>$GST Token</p>
            <h2 style={S.h2}>One Token. Five Constitutional Roles.</h2>
            <p style={{ ...S.body, marginBottom: 28 }}>
              The Ghost Sovereign Token has a fixed genesis supply of 1,000,000,000 — no additional mint function.
              Its circulating supply is governed by a constitutional supply formula: adaptive burn, reserve locking, and tapering emissions.
            </p>
            <div style={{ background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.18)', borderRadius: 10, padding: '18px 22px', marginBottom: 20 }}>
              <div style={{ ...S.mono, fontSize: '0.62rem', color: '#8A9BB5', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>Supply Formula</div>
              <div style={{ ...S.mono, fontSize: 'clamp(0.9rem,2vw,1.2rem)', fontWeight: 700, color: '#7A5CFF' }}>
                S(t) = S₀ − B(t) − R(t) + E(t)
              </div>
            </div>
            <div style={{ background: 'rgba(255,59,59,0.05)', border: '1px solid rgba(255,59,59,0.18)', borderRadius: 10, padding: '18px 22px' }}>
              <div style={{ ...S.mono, fontSize: '0.62rem', color: '#8A9BB5', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>Adaptive Burn Rate</div>
              <div style={{ ...S.mono, fontSize: 'clamp(0.85rem,1.8vw,1.1rem)', fontWeight: 700, color: '#FF3B3B' }}>
                β(u) = 0.02 + 0.10 · max(0, u − 0.5)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <Link href="/site/token" style={{ background: 'rgba(201,162,39,0.1)', color: '#C9A227', padding: '10px 20px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.25)' }}>
                Token Details →
              </Link>
              <Link href="/site/investors" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '10px 20px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>
                Projections →
              </Link>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {gstStats.map((stat) => (
              <div key={stat.label} className="gs-hud" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '18px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${stat.color}70, transparent)` }} />
                <div style={{ ...S.mono, fontSize: 'clamp(1rem,2.5vw,1.4rem)', fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                <div style={{ ...S.mono, fontSize: '0.58rem', color: `${stat.color}80`, letterSpacing: '0.08em', marginTop: 2 }}>{stat.unit}</div>
                <div style={{ ...S.mono, fontSize: '0.55rem', color: '#4A5568', letterSpacing: '0.12em', marginTop: 8, textTransform: 'uppercase' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROADMAP ────────────────────────────────────────────────────── */}
      <section style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={S.cap}>Roadmap 2026</p>
            <h2 style={S.h2}>Phased. Constitutional. On Schedule.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {timeline.map((t) => {
              const c = t.s === 'complete' ? '#00F0B5' : t.s === 'active' ? '#7A5CFF' : '#4A5568';
              const dotClass = t.s === 'complete' ? 'gs-dot-teal' : t.s === 'active' ? 'gs-dot-purple' : '';
              return (
                <div key={t.q} className="gs-card-hover" style={{ background: t.s === 'active' ? 'rgba(122,92,255,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${c}22`, borderRadius: 12, padding: '22px', position: 'relative', overflow: 'hidden' }}>
                  {t.s === 'active' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, #7A5CFF, transparent)` }} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={dotClass} style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
                      <span style={{ ...S.mono, fontSize: '0.62rem', fontWeight: 700, color: c, letterSpacing: '0.08em' }}>{t.q}</span>
                    </div>
                    <span style={{ ...S.mono, fontSize: '0.55rem', fontWeight: 700, color: c, background: `${c}18`, padding: '2px 7px', borderRadius: 3, letterSpacing: '0.1em' }}>
                      {t.s === 'complete' ? '✓ DONE' : t.s === 'active' ? '◉ LIVE' : '○ SOON'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.95rem', fontWeight: 700, color: '#E8EDF5', marginBottom: 14 }}>{t.label}</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {t.items.map((item) => (
                      <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.74rem', color: '#8A9BB5' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────────────── */}
      <section style={{ ...S.section, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 400, background: 'radial-gradient(ellipse, rgba(122,92,255,0.10) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div className="gs-grid-bg gs-pulse" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
        <div style={{ position: 'relative' }}>
          <p style={S.cap}>Join the Federation</p>
          <h2 style={{ ...S.h2, fontSize: 'clamp(1.8rem,4.5vw,3.2rem)', marginBottom: 20 }}>The Autonomous Infrastructure<br />Era Starts Now.</h2>
          <p style={{ ...S.body, maxWidth: 520, margin: '0 auto 44px', fontSize: '0.95rem' }}>
            Whether you are a user, investor, or builder — GhostStack provides the sovereign infrastructure layer your digital future requires.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 52 }}>
            <Link href="/site/users" className="gs-btn-primary" style={{ background: 'linear-gradient(135deg, #7A5CFF, #4A2CDF)', color: '#fff', padding: '15px 36px', borderRadius: 10, fontSize: '0.92rem', fontWeight: 700, textDecoration: 'none', boxShadow: '0 0 40px rgba(122,92,255,0.4)' }}>Get Started as a User</Link>
            <Link href="/site/investors" style={{ background: 'rgba(201,162,39,0.08)', color: '#C9A227', padding: '15px 36px', borderRadius: 10, fontSize: '0.92rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.3)' }}>Investor Relations</Link>
            <Link href="/site/whitepaper" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '15px 36px', borderRadius: 10, fontSize: '0.92rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>Read Whitepaper</Link>
          </div>
          {/* Doctrine */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
            {['Governance is code', 'Intelligence is enforced', 'Sovereignty is engineered'].map((line, i) => (
              <span key={line} style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.14em', color: '#4A5568', textTransform: 'uppercase' }}>
                {i > 0 && <span style={{ margin: '0 12px', color: '#7A5CFF' }}>·</span>}
                {line}
              </span>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
