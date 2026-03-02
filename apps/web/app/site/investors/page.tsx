import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicNav, PublicFooter } from '../_components/PublicNav';

export const metadata: Metadata = {
  title: 'Investor Relations — GhostStack',
  description: 'Investment thesis, 5-year financial projections, GST tokenomics, treasury model, and constitutional governance. GhostStack Investor Relations.',
};

const S = {
  page:    { background: '#070B10', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  section: { maxWidth: 1100, margin: '0 auto', padding: 'clamp(64px,9vw,100px) clamp(16px,4vw,48px)' } as React.CSSProperties,
  cap:     { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', color: '#C9A227', textTransform: 'uppercase' as const, marginBottom: 10 } as React.CSSProperties,
  h2:      { fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.3rem,2.8vw,1.9rem)', fontWeight: 700, letterSpacing: '0.06em', color: '#E8EDF5', textTransform: 'uppercase' as const, marginBottom: 14, marginTop: 0 } as React.CSSProperties,
  body:    { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.85rem', color: '#8A9BB5', lineHeight: 1.75 } as React.CSSProperties,
  mono:    { fontFamily: 'JetBrains Mono, monospace' } as React.CSSProperties,
};

const projections = [
  { year: 'Year 1', bear: '$1.1M',  base: '$4.2M',  bull: '$14.3M', note: 'Genesis · Bootstrap phase' },
  { year: 'Year 2', bear: '$2.3M',  base: '$18.6M', bull: '$85.4M', note: 'L2 activation · Treasury self-sustaining (Base)' },
  { year: 'Year 3', bear: '$4.1M',  base: '$72.4M', bull: '$480M',  note: 'Growth · AI autonomy live' },
  { year: 'Year 4', bear: '$6.8M',  base: '$198M',  bull: '$1.84B', note: 'Scale · Enterprise integrations' },
  { year: 'Year 5', bear: '$10.4M', base: '$494M',  bull: '$5.87B', note: 'Maturity · Full AI governance' },
  { year: '5Y Total', bear: '$24.7M', base: '$787M', bull: '$8.29B', note: 'Cumulative protocol revenue' },
];

const tokenRoles = [
  { role: 'Gas',        color: '#00C2FF', desc: 'All transaction fees on L1, L2, L3 paid in $GST. GhostLoad AI dynamically adjusts base fee to maintain equilibrium.' },
  { role: 'Governance', color: '#7A5CFF', desc: 'Vote on protocol upgrades, treasury allocations, and parameter changes. Multi-sig timelock. No EOA authority.' },
  { role: 'Staking',    color: '#C9A227', desc: 'Validator bond in $GST. Slash conditions enforced on-chain by GhostSentinel AI. APY 8–22% depending on scenario.' },
  { role: 'Burn',       color: '#FF3B3B', desc: '2% base burn/epoch (adaptive up to 2.5% at ≥80% load). Net-deflationary from Year 1 in Base scenario.' },
  { role: 'Buyback',    color: '#00F0B5', desc: '15% of surplus protocol revenue. Smart-contract-automated. Treasury floor (20%) preserved before any distribution.' },
];

const treasuryItems = [
  { label: 'Reserve Floor',        value: '20% of circulating GST',  color: '#C9A227', desc: 'Constitutional minimum. Cannot be overridden by any EOA or multisig.' },
  { label: 'Self-Sustaining',      value: 'Year 2 (Base)',            color: '#00F0B5', desc: 'Protocol yield covers validator rewards + buyback + reserve without external funding.' },
  { label: 'Buyback Rate',         value: '15% of surplus',           color: '#7A5CFF', desc: 'Automated smart-contract buyback on secondary markets. No discretionary mint.' },
  { label: 'ZK Solvency Proofs',   value: 'On-chain, quarterly',      color: '#00C2FF', desc: 'Zero-knowledge proofs of treasury solvency. Publicly verifiable, cryptographically binding.' },
  { label: 'Governance Authority', value: 'Contract-only',            color: '#FF3B3B', desc: 'GhostUpgradeGovernor + timelock. No EOA can unilaterally move funds.' },
];

const thesis = [
  { id: 'T-01', color: '#00F0B5', title: 'First-Mover Constitutional Protocol', body: 'No comparable protocol encodes AI governance + constitutional invariants at genesis. We are not iterating on existing designs — we are replacing the design surface entirely.' },
  { id: 'T-02', color: '#C9A227', title: 'Closed-Loop Deflationary Engine',     body: 'L3 fees → L2 → L1 treasury → yield → buyback/burn → supply compression. Net deflationary from Year 1 in Base scenario across all simulation parameters.' },
  { id: 'T-03', color: '#7A5CFF', title: 'AI-Governed Capital Efficiency',      body: 'Treasury AI outperforms manual allocation by routing capital to highest-yield strategies within constitutional risk bounds. No discretionary manager required.' },
  { id: 'T-04', color: '#00C2FF', title: 'Federation TAM Capture',              body: 'Enterprise blockchain infrastructure is a $220B+ market by 2029. GhostStack positions as the constitutional settlement layer for sovereign digital enterprises.' },
];

export default function InvestorsPage() {
  return (
    <div style={S.page}>
      <PublicNav />

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(201,162,39,0.1)' }}>
        <div className="gs-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% -10%, rgba(201,162,39,0.10) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div style={{ ...S.section, paddingTop: 'clamp(72px,10vw,108px)', paddingBottom: 56, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <span className="gs-dot-gold" style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9A227', display: 'inline-block' }} />
            <span style={{ ...S.mono, fontSize: '0.6rem', fontWeight: 700, color: '#C9A227', letterSpacing: '0.18em' }}>INVESTOR RELATIONS · MARCH 2026</span>
          </div>
          <h1 style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.8rem,4vw,3rem)', fontWeight: 700, letterSpacing: '0.04em', color: '#E8EDF5', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 20 }}>
            Sovereign Economics.<br /><span style={{ color: '#C9A227' }}>Constitutionally Enforced.</span>
          </h1>
          <p style={{ ...S.body, maxWidth: 580, fontSize: '0.95rem', marginBottom: 32 }}>
            GhostStack is not another blockchain project. It is a constitutionally governed, AI-optimized multichain federation
            with a closed-loop economic engine and provably deflationary tokenomics from genesis.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="#projections" style={{ background: 'linear-gradient(135deg, #C9A227, #906e10)', color: '#0B0F14', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>View Projections ↓</a>
            <Link href="/site/whitepaper" style={{ background: 'rgba(201,162,39,0.08)', color: '#C9A227', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.25)' }}>Read Whitepaper</Link>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <div style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px clamp(16px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px,1fr))', gap: 12 }}>
          {[
            { label: '5Y Bull Revenue',  value: '$8.29B',          color: '#C9A227' },
            { label: '5Y Base Revenue',  value: '$787M',           color: '#8A9BB5' },
            { label: 'Genesis Supply',   value: '1,000,000,000',   color: '#C9A227' },
            { label: 'Reserve Floor',    value: '≥ 20%',           color: '#00F0B5' },
            { label: 'Base Burn/Epoch',  value: '2.00%',           color: '#FF3B3B' },
            { label: 'Self-Sustaining',  value: 'Year 2',          color: '#7A5CFF' },
          ].map((m) => (
            <div key={m.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${m.color}60, transparent)` }} />
              <div style={{ ...S.mono, fontSize: 'clamp(0.95rem,2vw,1.2rem)', fontWeight: 700, color: m.color }}>{m.value}</div>
              <div style={{ ...S.mono, fontSize: '0.54rem', color: '#4A5568', letterSpacing: '0.12em', marginTop: 6, textTransform: 'uppercase' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Projections */}
      <section id="projections" style={{ ...S.section }}>
        <p style={S.cap}>Financial Projections</p>
        <h2 style={S.h2}>5-Year Protocol Revenue Model.</h2>
        <p style={{ ...S.body, maxWidth: 600, marginBottom: 28 }}>
          Modeled across three scenarios: bear (minimal adoption), base (moderate growth), and bull (accelerated federation expansion).
          All scenarios project net-deflationary supply from Year 1 in Base case.
        </p>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {['Period', 'Bear', 'Base', 'Bull', 'Notes'].map((h) => (
              <div key={h} style={{ ...S.mono, padding: '10px 16px', fontSize: '0.58rem', fontWeight: 700, color: '#8A9BB5', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {projections.map((r, i) => {
            const isTot = r.year === '5Y Total';
            return (
              <div key={r.year} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr 1fr', borderBottom: i < projections.length-1 ? '1px solid rgba(255,255,255,0.04)' : undefined, background: isTot ? 'rgba(201,162,39,0.05)' : undefined }}>
                <div style={{ ...S.mono, padding: '12px 16px', fontSize: '0.75rem', fontWeight: isTot ? 700 : 500, color: isTot ? '#C9A227' : '#E8EDF5', borderBottom: isTot ? undefined : undefined }}>{r.year}</div>
                <div style={{ ...S.mono, padding: '12px 16px', fontSize: '0.75rem', color: '#4A5568' }}>{r.bear}</div>
                <div style={{ ...S.mono, padding: '12px 16px', fontSize: '0.75rem', color: isTot ? '#E8EDF5' : '#8A9BB5', fontWeight: isTot ? 700 : 400 }}>{r.base}</div>
                <div style={{ ...S.mono, padding: '12px 16px', fontSize: '0.75rem', color: isTot ? '#C9A227' : '#00F0B5', fontWeight: isTot ? 700 : 400 }}>{r.bull}</div>
                <div style={{ padding: '12px 16px', fontSize: '0.72rem', color: '#4A5568', fontFamily: 'Inter, system-ui, sans-serif' }}>{r.note}</div>
              </div>
            );
          })}
        </div>
        <p style={{ ...S.body, fontSize: '0.72rem', marginTop: 12, color: '#4A5568' }}>
          Revenue includes L3 transaction fees, L2 exchange fees, validator staking yield, and external treasury yield. All figures in USD equivalent.
        </p>
      </section>

      {/* Investment Thesis */}
      <section style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <p style={S.cap}>Investment Thesis</p>
          <h2 style={S.h2}>Four Structural Advantages.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {thesis.map((t) => (
              <div key={t.id} className="gs-hud gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${t.color}`, borderRadius: 10, padding: '18px 22px', display: 'flex', gap: 18, position: 'relative' }}>
                <span style={{ ...S.mono, fontSize: '0.6rem', fontWeight: 700, color: t.color, background: `${t.color}12`, border: `1px solid ${t.color}20`, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.1em', flexShrink: 0, alignSelf: 'flex-start' }}>{t.id}</span>
                <div>
                  <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#E8EDF5', marginBottom: 6 }}>{t.title}</div>
                  <p style={{ ...S.body, margin: 0, fontSize: '0.82rem' }}>{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Token Roles */}
      <section style={{ ...S.section }}>
        <p style={S.cap}>$GST Token Economics</p>
        <h2 style={S.h2}>Five Constitutional Roles.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 12 }}>
          {tokenRoles.map((r) => (
            <div key={r.role} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${r.color}, transparent)` }} />
              <div style={{ ...S.mono, fontSize: '0.65rem', fontWeight: 700, color: r.color, letterSpacing: '0.14em', marginBottom: 8, textTransform: 'uppercase' }}>{r.role}</div>
              <p style={{ ...S.body, margin: 0, fontSize: '0.8rem' }}>{r.desc}</p>
            </div>
          ))}
          <div style={{ background: 'rgba(122,92,255,0.05)', border: '1px solid rgba(122,92,255,0.2)', borderRadius: 12, padding: '20px' }}>
            <div style={{ ...S.mono, fontSize: '0.6rem', color: '#8A9BB5', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>Supply Formula</div>
            <div style={{ ...S.mono, fontSize: '1.05rem', fontWeight: 700, color: '#7A5CFF', marginBottom: 12 }}>S(t) = S₀ − B(t) − R(t) + E(t)</div>
            <div style={{ ...S.mono, fontSize: '0.62rem', color: '#8A9BB5', letterSpacing: '0.08em', marginBottom: 4 }}>Adaptive burn: β(u) = 0.02 + 0.10 · max(0, u − 0.5)</div>
            <div style={{ ...S.mono, fontSize: '0.58rem', color: '#4A5568' }}>κ = 0.10 · Peak burn: 2.5% at ≥80% load</div>
          </div>
        </div>
      </section>

      {/* Treasury Model */}
      <section style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <p style={S.cap}>Treasury Architecture</p>
          <h2 style={S.h2}>Constitutional Treasury. No EOA Authority.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {treasuryItems.map((t) => (
              <div key={t.label} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '14px 18px', display: 'grid', gridTemplateColumns: '200px 160px 1fr', alignItems: 'center', gap: 16 }}>
                <span style={{ ...S.mono, fontSize: '0.62rem', color: '#8A9BB5', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t.label}</span>
                <span style={{ ...S.mono, fontSize: '0.78rem', fontWeight: 700, color: t.color }}>{t.value}</span>
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem', color: '#8A9BB5' }}>{t.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...S.section, textAlign: 'center' }}>
        <p style={S.cap}>Ready to Invest</p>
        <h2 style={{ ...S.h2, fontSize: 'clamp(1.4rem,3vw,2.2rem)' }}>The Autonomous Era Needs Sovereign Capital.</h2>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
          <Link href="/site/whitepaper" style={{ background: 'linear-gradient(135deg, #C9A227, #906e10)', color: '#0B0F14', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none' }}>Read Whitepaper</Link>
          <Link href="/site/token" style={{ background: 'rgba(201,162,39,0.08)', color: '#C9A227', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.25)' }}>$GST Token</Link>
          <Link href="/site" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>Back to Overview</Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
