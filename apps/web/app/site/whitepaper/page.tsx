import type { Metadata } from 'next';
import Link from 'next/link';
import { LayerBadge } from '@/components/brand/LayerBadge';
import { PublicNav, PublicFooter } from '../_components/PublicNav';

export const metadata: Metadata = {
  title: 'Whitepaper — GhostStack',
  description:
    'GhostStack Whitepaper v1.0 — AI-governed sovereign multichain federation. Constitutional governance, energy-efficient consensus, and long-horizon digital sovereignty.',
};

const S = {
  page: { background: '#070B10', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  section: { maxWidth: 860, margin: '0 auto', padding: 'clamp(40px, 6vw, 72px) clamp(16px, 4vw, 48px)' } as React.CSSProperties,
  wide: { maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px, 4vw, 48px)' } as React.CSSProperties,
  label: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.18em', color: '#8A9BB5', textTransform: 'uppercase' as const, marginBottom: 10 } as React.CSSProperties,
  cap:   { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', color: '#7A5CFF', textTransform: 'uppercase' as const, marginBottom: 10 } as React.CSSProperties,
  h2: { fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.1rem, 2.4vw, 1.6rem)', fontWeight: 700, letterSpacing: '0.06em', color: '#E8EDF5', textTransform: 'uppercase' as const, marginBottom: 16, marginTop: 0 } as React.CSSProperties,
  h3: { fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, color: '#E8EDF5', marginBottom: 10 } as React.CSSProperties,
  body: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.88rem', color: '#8A9BB5', lineHeight: 1.8, marginBottom: 16 } as React.CSSProperties,
  divider: { borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 clamp(16px,4vw,48px)', paddingTop: 0 } as React.CSSProperties,
  mono: { fontFamily: 'JetBrains Mono, Menlo, monospace' } as React.CSSProperties,
};

const toc = [
  { id: 'abstract',     label: 'Abstract'                                  },
  { id: 'problems',     label: '§1  Structural Failures'                   },
  { id: 'thesis',       label: '§2  Layered Sovereignty Thesis'            },
  { id: 'architecture', label: '§3  System Architecture'                   },
  { id: 'ai',           label: '§4  Hyper Ghost AI Governance'             },
  { id: 'constitution', label: '§5  Constitutional Enforcement'             },
  { id: 'economics',    label: '§6  Economic Model — $GST'                 },
  { id: 'federation',   label: '§7  Federation Model'                      },
  { id: 'security',     label: '§8  Security Architecture'                 },
  { id: 'roadmap',      label: '§9  Roadmap'                               },
  { id: 'conclusion',   label: '§10 Conclusion'                            },
];

const problems = [
  { id: '§1.1', title: 'Gas Volatility',          impact: '10,000%+ fee spikes during peak demand. No forward-looking equilibrium mechanism.' },
  { id: '§1.2', title: 'Fragmented Liquidity',    impact: '$2.5B+ lost to bridge exploits. 0.3–2% additional slippage per transaction.' },
  { id: '§1.3', title: 'Governance Capture',      impact: 'Hundreds of millions lost. Chronic quorum failures. EOA admin keys as single points of failure.' },
  { id: '§1.4', title: 'Validator Misalignment',  impact: 'Narrow slashing. Cartel behavior without constitutional consequence.' },
  { id: '§1.5', title: 'Energy Inefficiency',     impact: 'Validators run at full capacity regardless of load. Conservative gas targets waste compute.' },
];

const aiSystems = [
  { name: 'GhostLoad AI',  layer: 'AI'  as const, color: '#00F0B5', role: 'Gas Optimization & Load Balancing',      desc: 'Continuously models demand curves and adjusts gas targets before congestion occurs. Rebalances validator load across regions.' },
  { name: 'GhostDNS AI',   layer: 'AI'  as const, color: '#00F0B5', role: 'Network Intelligence & Routing',          desc: 'AI-resolved peer routing and DNS resolution. Maintains federation mesh topology with adaptive failover and privacy preservation.' },
  { name: 'Treasury AI',   layer: 'AI'  as const, color: '#00F0B5', role: 'Capital Allocation & Yield Optimization', desc: 'Risk-scores external yield strategies. Executes buyback and burn. Enforces constitutional allocation bounds in every operation.' },
  { name: 'GhostSentinel', layer: 'SEC' as const, color: '#FF3B3B', role: 'AI Threat Detection & Security',          desc: 'Continuous on-chain monitoring. Anomaly detection. Quarantine triggers for malicious validator behavior. Formal slashing rationale.' },
];

const invariants = [
  { id: 'I-01', color: '#00C2FF', title: 'Routing Law',             rule: 'L3 → L2 → L1 only. L3 → L1 direct is FORBIDDEN. Enforced at smart contract dispatch level.' },
  { id: 'I-02', color: '#C9A227', title: 'Reserve Floor',           rule: 'Treasury reserve ≥ 20% of circulating GST at all times. Withdrawal blocked if floor violated.' },
  { id: 'I-03', color: '#FF3B3B', title: 'No EOA Authority',        rule: 'No externally owned address holds unilateral authority over treasury, governance, or upgrade.' },
  { id: 'I-04', color: '#7A5CFF', title: 'Governance Timelock',     rule: 'All upgrades require supermajority + timelock. Emergency pause requires GUARDIAN_ROLE key.' },
  { id: 'I-05', color: '#FF3B3B', title: 'Ambiguity Fails Closed',  rule: 'Undefined policy states default to rejection. No open-ended emergency withdrawal paths exist.' },
  { id: 'I-06', color: '#00F0B5', title: 'AI Boundary Enforcement', rule: 'AI authority scope is governance-locked. AI cannot exceed delegated parameters unilaterally.' },
];

const gstRoles = [
  { role: 'Gas',        layer: 'L1, L2, L3', color: '#00C2FF', fn: 'All transaction fees paid in $GST. GhostLoad AI adjusts base fee dynamically.' },
  { role: 'Governance', layer: 'L1',         color: '#7A5CFF', fn: 'Staked GST = governance weight. Supermajority required for constitutional changes.' },
  { role: 'Staking',    layer: 'L1',         color: '#C9A227', fn: 'Validator bond in GST. Slashing enforced by GhostSentinel AI on misbehavior.' },
  { role: 'Burn',       layer: 'All',        color: '#FF3B3B', fn: '2% base burn per epoch. Adaptive up to 2.5% at ≥80% load. κ = 0.10.' },
  { role: 'Buyback',    layer: 'L1',         color: '#00F0B5', fn: '15% of surplus protocol revenue. Smart contract automated. Treasury floor preserved first.' },
];

const roadmap = [
  { q: 'Q1 2026', phase: 'Genesis',    status: 'complete', color: '#00F0B5', items: ['L1 GhostChain mainnet', 'GST genesis distribution', 'Constitutional contracts', 'L2 OP Stack integration'] },
  { q: 'Q2 2026', phase: 'Foundation', status: 'active',   color: '#7A5CFF', items: ['L3 utility execution layer', 'GhostWallet launch', 'GhostXchange beta', 'ZK solvency proofs'] },
  { q: 'Q3 2026', phase: 'Growth',     status: 'upcoming', color: '#8A9BB5', items: ['SDK ecosystem release', 'Multi-region validators', 'AI governance live', 'Exchange listings'] },
  { q: 'Q4 2026', phase: 'Scale',      status: 'upcoming', color: '#8A9BB5', items: ['Enterprise integrations', 'Cross-federation bridges', 'Full AI autonomy', 'Global node expansion'] },
];

export default function WhitepaperPage() {
  return (
    <div style={S.page}>
      <PublicNav />

      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(122,92,255,0.1)' }}>
        <div className="gs-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.25 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(122,92,255,0.1) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div style={{ ...S.section, textAlign: 'center', paddingTop: 'clamp(72px, 10vw, 108px)', paddingBottom: 48, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
            <span className="gs-dot-purple" style={{ width: 7, height: 7, borderRadius: '50%', background: '#7A5CFF', display: 'inline-block' }} />
            <span style={{ ...S.cap, marginBottom: 0 }}>GhostStack Whitepaper — v1.0 · March 2026</span>
          </div>
          <h1 style={{
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', fontWeight: 700,
            letterSpacing: '0.04em', color: '#E8EDF5', textTransform: 'uppercase', marginBottom: 16, lineHeight: 1.1,
          }}>
            Autonomy Secured.<br /><span style={{ color: '#7A5CFF' }}>Sovereignty Engineered.</span>
          </h1>
          <p style={{ ...S.body, maxWidth: 580, margin: '0 auto 32px', fontSize: '0.92rem' }}>
            A constitutionally governed, AI-optimized, multi-layer protocol for sovereign digital infrastructure.
            This document describes the technical architecture, economic model, governance system, and
            constitutional invariants of the GhostStack federation.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/site/investors" style={{ background: 'rgba(201,162,39,0.12)', color: '#C9A227', padding: '10px 22px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.3)' }}>Investor Relations</Link>
            <Link href="/site/token" style={{ background: 'rgba(122,92,255,0.1)', color: '#7A5CFF', padding: '10px 22px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(122,92,255,0.25)' }}>$GST Token</Link>
            <Link href="/site/developers" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '10px 22px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>For Developers</Link>
          </div>
        </div>
      </div>

      {/* Layout: TOC sidebar + content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 0, padding: '0 clamp(16px,4vw,48px)' }}>

        {/* ── TOC sidebar ──────────────────────────────────────────────── */}
        <aside style={{ paddingTop: 48, paddingRight: 32 }}>
          <div style={{ position: 'sticky', top: 80, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 14px' }}>
            <p style={{ ...S.cap, marginBottom: 14 }}>Contents</p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {toc.map((item) => (
                <a key={item.id} href={`#${item.id}`} style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem',
                  color: '#8A9BB5', textDecoration: 'none',
                  padding: '5px 8px', borderRadius: 5, lineHeight: 1.4,
                  transition: 'color 0.15s',
                }}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <main style={{ paddingTop: 48, paddingBottom: 80, borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: 48, minWidth: 0 }}>

          {/* Abstract */}
          <section id="abstract" style={{ marginBottom: 56 }}>
            <p style={S.cap}>Abstract</p>
            <p style={{ ...S.body, fontSize: '0.95rem', lineHeight: 1.85, color: '#C5CDD9' }}>
              GhostStack is an AI-governed sovereign multichain federation consisting of three interdependent protocol layers —
              a Layer 1 constitutional settlement chain (GhostChain), a Layer 2 liquidity and exchange layer (GhostL2),
              and a Layer 3 utility execution layer (GhostL3) — governed by a first-class AI participant (Hyper Ghost AI)
              and enforced by constitutional smart contracts that codify immutable operational invariants.
            </p>
            <p style={{ ...S.body, fontSize: '0.95rem', lineHeight: 1.85, color: '#C5CDD9' }}>
              The protocol is designed to solve five structural failures present in existing blockchain deployments:
              gas volatility, fragmented liquidity, governance capture, validator misalignment, and energy inefficiency.
              All solutions are implemented as constitutional invariants enforced at genesis — not social conventions or
              multisig override mechanisms.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {(['L1', 'L2', 'L3', 'AI', 'SEC'] as const).map((l) => (
                <LayerBadge key={l} layer={l} showDot />
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §1 — Problems */}
          <section id="problems" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§1 — Structural Failures</p>
            <h2 style={S.h2}>Five Problems. One Constitution.</h2>
            <p style={S.body}>
              Existing blockchain infrastructure exhibits five systemic structural failures that cannot be patched
              at the application layer. GhostStack addresses each through constitutional enforcement — embedding
              the solution into the protocol's foundational contracts.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              {problems.map((p) => (
                <div key={p.id} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid #FF3B3B', borderRadius: 10, padding: '16px 18px', display: 'flex', gap: 16 }}>
                  <span style={{ ...S.mono, fontSize: '0.65rem', fontWeight: 700, color: '#FF3B3B', background: 'rgba(255,59,59,0.1)', padding: '3px 8px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>{p.id}</span>
                  <div>
                    <h3 style={{ ...S.h3, color: '#E8EDF5', marginBottom: 5 }}>{p.title}</h3>
                    <p style={{ ...S.body, margin: 0 }}>{p.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §2 — Thesis */}
          <section id="thesis" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§2 — Layered Sovereignty Thesis</p>
            <h2 style={S.h2}>Sovereignty Through Separation of Concerns.</h2>
            <p style={S.body}>
              The layered sovereignty thesis holds that sovereign digital infrastructure must separate concerns across
              functionally distinct layers — each with a defined responsibility, fee routing obligation, and
              constitutional authority boundary. Consolidation of functions into a single layer creates systemic fragility.
            </p>
            <p style={S.body}>
              GhostStack implements three layers with strict constitutional routing: L3 serves users and applications
              with minimal-cost execution; L2 concentrates liquidity and provides exchange infrastructure; L1 provides
              final settlement, treasury management, and constitutional enforcement.
            </p>
            <div style={{ background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.2)', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ ...S.mono, fontSize: '0.65rem', fontWeight: 700, color: '#8A9BB5', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Constitutional Routing Invariant (I-01)</span>
              {[
                { text: 'GhostL3',     color: '#00C2FF' }, { text: '→', color: '#7A5CFF' },
                { text: 'GhostL2',     color: '#7A5CFF' }, { text: '→', color: '#7A5CFF' },
                { text: 'GhostChain',  color: '#C9A227' },
              ].map((t, i) =>
                t.text === '→' ? <span key={i} style={{ color: '#7A5CFF', fontWeight: 700 }}>→</span>
                               : <span key={i} style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: t.color }}>{t.text}</span>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', color: '#FF3B3B' }}>L3 → L1 DIRECT: FORBIDDEN</span>
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §3 — Architecture */}
          <section id="architecture" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§3 — System Architecture</p>
            <h2 style={S.h2}>Four Interconnected Layers.</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { name: 'GhostChain (L1)', layer: 'L1' as const, color: '#C9A227', desc: 'Sovereign settlement, treasury, governance ratification. IBFT 2.0 consensus. All constitutional contracts deployed here.' },
                { name: 'GhostL2',         layer: 'L2' as const, color: '#7A5CFF', desc: 'OP Stack-derived liquidity and exchange layer. GhostXchange AMM. Canonical liquidity concentrated at this layer by routing law.' },
                { name: 'GhostL3',         layer: 'L3' as const, color: '#00C2FF', desc: 'OP Stack-compatible execution environment for dApps. Sub-cent transactions. AI-optimized gas. Full EVM compatibility.' },
                { name: 'Hyper Ghost AI',  layer: 'AI' as const, color: '#00F0B5', desc: 'First-class protocol participant. Governs gas equilibrium, peer routing, capital allocation, and security monitoring autonomously.' },
              ].map((lyr) => (
                <div key={lyr.name} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${lyr.color}22`, borderTop: `3px solid ${lyr.color}`, borderRadius: 10, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <LayerBadge layer={lyr.layer} showDot />
                    <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: lyr.color }}>{lyr.name}</span>
                  </div>
                  <p style={{ ...S.body, margin: 0, fontSize: '0.78rem' }}>{lyr.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §4 — AI */}
          <section id="ai" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§4 — Hyper Ghost AI Governance</p>
            <h2 style={S.h2}>Intelligence as a Protocol Primitive.</h2>
            <p style={S.body}>
              Hyper Ghost AI is not a layer on top of the protocol — it is a first-class participant with
              governance-locked authority, constitutionally bounded scope, and on-chain accountability for
              every action it takes. It operates across four specialized subsystems.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aiSystems.map((sys) => (
                <div key={sys.name} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0 }}>
                    <LayerBadge layer={sys.layer} showDot />
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: sys.color }}>{sys.name}</span>
                      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{sys.role}</span>
                    </div>
                    <p style={{ ...S.body, margin: 0 }}>{sys.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §5 — Constitution */}
          <section id="constitution" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§5 — Constitutional Enforcement</p>
            <h2 style={S.h2}>Six Hard Invariants. No Exceptions.</h2>
            <p style={S.body}>
              Constitutional invariants are smart contract functions that cannot be overridden by any governance action,
              emergency mechanism, or external key. They are tested at every state transition and fail closed on ambiguity.
              They are not conventions — they are cryptographic laws.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invariants.map((inv) => (
                <div key={inv.id} className="gs-hud gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${inv.color}`, borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 14 }}>
                  <span style={{ ...S.mono, fontSize: '0.65rem', fontWeight: 700, color: inv.color, background: `${inv.color}15`, padding: '3px 8px', borderRadius: 4, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>{inv.id}</span>
                  <div>
                    <h3 style={{ ...S.h3, color: '#E8EDF5', marginBottom: 4 }}>{inv.title}</h3>
                    <p style={{ ...S.body, margin: 0 }}>{inv.rule}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §6 — Economics */}
          <section id="economics" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§6 — Economic Model — $GST</p>
            <h2 style={S.h2}>One Token. Five Constitutional Roles.</h2>
            <p style={S.body}>
              The Ghost Sovereign Token ($GST) has a genesis supply of 1,000,000,000 with no additional mint function.
              Its circulating supply is governed by a constitutional formula that encodes burn, reserve locking, and
              tapering ecosystem emissions.
            </p>

            {/* Supply formula */}
            <div style={{ background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.2)', borderRadius: 10, padding: '20px', marginBottom: 20, textAlign: 'center' }}>
              <div style={{ ...S.mono, fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', fontWeight: 700, color: '#7A5CFF', marginBottom: 8 }}>
                S(t) = S₀ − B(t) − R(t) + E(t)
              </div>
              <p style={{ ...S.body, margin: 0, fontSize: '0.72rem' }}>
                S₀ = 1,000,000,000 · B(t) = cumulative burn · R(t) = reserve lock · E(t) = tapering emissions
              </p>
            </div>

            {/* Burn formula */}
            <div style={{ background: 'rgba(255,59,59,0.05)', border: '1px solid rgba(255,59,59,0.18)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ ...S.label, marginBottom: 8 }}>Adaptive Burn Rate</p>
              <div style={{ ...S.mono, fontSize: 'clamp(0.9rem, 2vw, 1.2rem)', fontWeight: 700, color: '#FF3B3B', marginBottom: 8 }}>
                β(u) = 0.02 + κ · max(0, u − 0.5)   where κ = 0.10
              </div>
              <p style={{ ...S.body, margin: 0, fontSize: '0.72rem' }}>
                Base burn: 2% per epoch. Adaptive peak: 2.5% at ≥80% network utilization. Hard upper bound enforced by constitution.
              </p>
            </div>

            {/* Token roles */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Role', 'Layer', 'Function'].map((h) => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: '#8A9BB5', fontWeight: 600, letterSpacing: '0.08em', fontSize: '0.62rem', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gstRoles.map((r) => (
                  <tr key={r.role} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: r.color, fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.72rem', letterSpacing: '0.08em' }}>{r.role.toUpperCase()}</td>
                    <td style={{ padding: '10px 12px', color: '#8A9BB5', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.73rem' }}>{r.layer}</td>
                    <td style={{ padding: '10px 12px', color: '#8A9BB5', lineHeight: 1.5 }}>{r.fn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §7 — Federation */}
          <section id="federation" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§7 — Federation Model</p>
            <h2 style={S.h2}>Sovereign Actors. Constitutional Obligations.</h2>
            <p style={S.body}>
              The GhostStack federation consists of distinct participating entities, each with defined roles,
              constitutional authority bounds, and accountability mechanisms. No entity holds unilateral authority.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { name: 'GhostStack Foundation', color: '#C9A227', role: 'Protocol stewardship, constitutional authorship, treasury oversight via governance' },
                { name: 'Validator Council',      color: '#7A5CFF', role: 'Block production, attestation, slashing enforcement, governance participation' },
                { name: 'Hyper Ghost AI',         color: '#00F0B5', role: 'Gas governance, routing intelligence, treasury allocation, security monitoring' },
                { name: 'GST Holders',            color: '#00C2FF', role: 'Governance voting rights, staking, fee payment, protocol participation' },
                { name: 'dApp Developers',        color: '#8A9BB5', role: 'L3 application deployment, SDK usage, constitutional plugin framework' },
                { name: 'GhostSentinel AI',       color: '#FF3B3B', role: 'Security enforcement, threat detection, quarantine authority within constitutional bounds' },
              ].map((e) => (
                <div key={e.name} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px' }}>
                  <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: e.color, marginBottom: 5 }}>{e.name}</div>
                  <p style={{ ...S.body, margin: 0, fontSize: '0.78rem' }}>{e.role}</p>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §8 — Security */}
          <section id="security" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§8 — Security Architecture</p>
            <h2 style={S.h2}>Constitutional Security by Design.</h2>
            <p style={S.body}>
              GhostStack's security model is grounded in formal verification, AI monitoring, and constitutional
              invariants — not multi-sig conventions or social consensus. Every upgrade path is gated.
              Every anomaly triggers an automated response.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { title: 'Formal Verification',    desc: 'All core contracts verified with Slither CI on every pull request. Invariant-checked before merge.' },
                { title: 'GhostSentinel AI',       desc: 'Continuous on-chain monitoring for anomalous transaction patterns, validator misbehavior, and governance attack vectors.' },
                { title: 'Constitutional Quarantine', desc: 'Validators with constitutional violations are quarantined automatically. Reinstatement requires governance quorum.' },
                { title: 'ZK Solvency Proofs',     desc: 'Quarterly zero-knowledge proofs of treasury solvency. Publicly verifiable. Cryptographically binding.' },
                { title: 'Upgrade Timelock',       desc: 'All contract upgrades require supermajority vote + minimum 48-hour timelock. No emergency override exists.' },
                { title: 'Emergency Protocol',     desc: 'Only GhostUpgradeGovernor.emergencyPause() with GUARDIAN_ROLE. Requires post-mortem + quorum to lift quarantine.' },
              ].map((s) => (
                <div key={s.title} style={{ background: 'rgba(255,59,59,0.03)', border: '1px solid rgba(255,59,59,0.1)', borderRadius: 8, padding: '13px 16px' }}>
                  <h3 style={{ ...S.h3, color: '#FF3B3B', marginBottom: 4, fontSize: '0.85rem' }}>{s.title}</h3>
                  <p style={{ ...S.body, margin: 0, fontSize: '0.78rem' }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §9 — Roadmap */}
          <section id="roadmap" style={{ marginBottom: 56 }}>
            <p style={S.cap}>§9 — Roadmap 2026</p>
            <h2 style={S.h2}>Phased Execution. Constitutional Gates.</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {roadmap.map((r) => (
                <div key={r.q} style={{ background: r.status === 'active' ? 'rgba(122,92,255,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${r.color}20`, borderRadius: 10, padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', fontWeight: 600, color: r.color }}>{r.q}</span>
                    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', color: r.color, background: `${r.color}18`, padding: '2px 7px', borderRadius: 4 }}>
                      {r.status === 'complete' ? '✓ Done' : r.status === 'active' ? '◉ Live' : '○ Upcoming'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: '#E8EDF5', marginBottom: 10 }}>{r.phase}</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r.items.map((item) => (
                      <li key={item} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.73rem', color: '#8A9BB5' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 56 }} />

          {/* §10 — Conclusion */}
          <section id="conclusion" style={{ marginBottom: 32 }}>
            <p style={S.cap}>§10 — Conclusion</p>
            <h2 style={S.h2}>Governance Is Code. Sovereignty Is Engineered.</h2>
            <p style={S.body}>
              GhostStack represents a fundamental rethinking of what sovereign digital infrastructure should be.
              Not a protocol with governance bolted on — but a protocol where governance <em>is</em> the protocol.
              Where intelligence is not an external tool but a first-class constitutional participant. Where
              invariants are not advisory but cryptographic law.
            </p>
            <p style={S.body}>
              The five structural failures that define the current generation of blockchain infrastructure — gas
              volatility, liquidity fragmentation, governance capture, validator misalignment, and energy
              inefficiency — are addressed not through incremental improvement but through constitutional
              redesign at genesis. They cannot be patched back in later. They cannot be governance-voted out.
              They are the foundation.
            </p>
            <p style={{ ...S.body, color: '#C5CDD9', fontStyle: 'italic' }}>
              "Autonomy Secured. Sovereignty Engineered." — GhostStack Foundation, 2026
            </p>

            {/* Doctrinal footer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 32, padding: '20px', background: 'rgba(122,92,255,0.05)', border: '1px solid rgba(122,92,255,0.15)', borderRadius: 10 }}>
              {['Governance is code.', 'Intelligence is enforced.', 'Sovereignty is engineered.'].map((line) => (
                <p key={line} style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', color: '#7A5CFF', textTransform: 'uppercase', margin: 0 }}>{line}</p>
              ))}
            </div>

            {/* Next steps */}
            <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap' }}>
              <Link href="/site/investors" style={{ background: 'linear-gradient(135deg, #C9A227, #906e10)', color: '#0B0F14', padding: '12px 24px', borderRadius: 9, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>Investor Relations</Link>
              <Link href="/site/token" style={{ background: 'rgba(122,92,255,0.1)', color: '#7A5CFF', padding: '12px 24px', borderRadius: 9, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(122,92,255,0.25)' }}>$GST Token</Link>
              <Link href="/site/developers" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '12px 24px', borderRadius: 9, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>For Developers</Link>
            </div>
          </section>
        </main>
      </div>

      <PublicFooter />
    </div>
  );
}
