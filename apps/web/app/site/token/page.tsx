import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicNav, PublicFooter } from '../_components/PublicNav';

export const metadata: Metadata = {
  title: '$GST Token — GhostStack',
  description: '$GST tokenomics: genesis supply 1B, adaptive burn, constitutional governance, staking, and treasury model.',
};

const S = {
  page:    { background: '#070B10', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  section: { maxWidth: 1100, margin: '0 auto', padding: 'clamp(64px,9vw,100px) clamp(16px,4vw,48px)' } as React.CSSProperties,
  cap:     { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', color: '#FF3B3B', textTransform: 'uppercase' as const, marginBottom: 10 } as React.CSSProperties,
  h2:      { fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.3rem,2.8vw,1.9rem)', fontWeight: 700, letterSpacing: '0.06em', color: '#E8EDF5', textTransform: 'uppercase' as const, marginBottom: 14, marginTop: 0 } as React.CSSProperties,
  body:    { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.85rem', color: '#8A9BB5', lineHeight: 1.75 } as React.CSSProperties,
  mono:    { fontFamily: 'JetBrains Mono, monospace' } as React.CSSProperties,
};

const params = [
  { param: 'Symbol',         value: '$GST',               color: '#C9A227', note: 'GhostStack Token' },
  { param: 'Name',           value: 'GhostStack Token',   color: '#C9A227', note: 'Full name' },
  { param: 'Genesis Supply', value: '1,000,000,000',      color: '#E8EDF5', note: 'Fixed at genesis · No mint function' },
  { param: 'Decimals',       value: '18',                 color: '#8A9BB5', note: 'EVM standard' },
  { param: 'Base Burn Rate', value: '2.00% / epoch',      color: '#FF3B3B', note: 'Adaptive up to 2.5% at ≥80% utilization' },
  { param: 'Max Burn',       value: '2.50% / epoch',      color: '#FF3B3B', note: 'Cap: κ=0.10 coefficient' },
  { param: 'κ (kappa)',      value: '0.10',               color: '#7A5CFF', note: 'Burn sensitivity to network utilization' },
  { param: 'Buyback Rate',   value: '15% of net surplus', color: '#00F0B5', note: 'Smart contract automated · no discretion' },
];

const distribution = [
  { label: 'Ecosystem & Users',      pct: 35, color: '#00F0B5' },
  { label: 'Treasury Reserve',       pct: 20, color: '#C9A227' },
  { label: 'Validator Incentives',   pct: 15, color: '#7A5CFF' },
  { label: 'Team (4yr vesting)',     pct: 15, color: '#8A9BB5' },
  { label: 'Investors (2yr vesting)',pct: 10, color: '#00C2FF' },
  { label: 'Genesis Reserve Burn',   pct: 5,  color: '#FF3B3B' },
];

const roles = [
  { id: 'GAS', color: '#00C2FF', title: 'Gas & Network Fees',    body: 'All L1, L2, and L3 transactions denominated in $GST. GhostLoad AI adjusts base fee dynamically to prevent spam and maintain equilibrium.' },
  { id: 'GOV', color: '#7A5CFF', title: 'Governance',            body: 'Weighted voting on protocol upgrades, treasury allocations, and parameter changes. Timelock enforced. No EOA can override on-chain vote outcomes.' },
  { id: 'STK', color: '#C9A227', title: 'Validator Staking',     body: 'Bond $GST as a validator (native ≥10K GST) or delegate. Slash conditions monitored by GhostSentinel AI in real-time. APY 8–22%.' },
  { id: 'BRN', color: '#FF3B3B', title: 'Adaptive Burn',         body: 'β(u) = 0.02 + 0.10 · max(0, u − 0.5). Supply is net-deflationary from Year 1 in Base scenario. No mint function exists.' },
  { id: 'BYB', color: '#00F0B5', title: 'Protocol Buyback',      body: '15% of net protocol surplus auto-buybacks via smart contract. Treasury floor (20%) maintained before any distribution.' },
];

export default function TokenPage() {
  return (
    <div style={S.page}>
      <PublicNav />

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,59,59,0.08)' }}>
        <div className="gs-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.25 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% -5%, rgba(201,162,39,0.09) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div style={{ ...S.section, paddingTop: 'clamp(72px,10vw,108px)', paddingBottom: 56, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <span className="gs-dot-gold" style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9A227', display: 'inline-block' }} />
            <span style={{ ...S.mono, fontSize: '0.6rem', fontWeight: 700, color: '#C9A227', letterSpacing: '0.18em' }}>$GST · GENESIS SUPPLY: 1,000,000,000 · NO MINT</span>
          </div>
          <h1 style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.8rem,4vw,3rem)', fontWeight: 700, letterSpacing: '0.04em', color: '#E8EDF5', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 20 }}>
            Deflationary by<br /><span style={{ color: '#C9A227' }}>Constitutional Design.</span>
          </h1>
          <p style={{ ...S.body, maxWidth: 560, fontSize: '0.95rem', marginBottom: 32 }}>
            $GST is the native token of the GhostStack federation. Fixed genesis supply, adaptive burn,
            automated buyback, and multi-role utility — all enforced on-chain with no discretionary override.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="#parameters" style={{ background: 'linear-gradient(135deg, #C9A227, #906e10)', color: '#0B0F14', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>Token Parameters ↓</a>
            <Link href="/site/investors" style={{ background: 'rgba(201,162,39,0.08)', color: '#C9A227', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.25)' }}>Investor Relations</Link>
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <div style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px clamp(16px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10 }}>
          {[
            { label: 'Ticker',          value: '$GST',       color: '#C9A227' },
            { label: 'Genesis Supply',  value: '1B',         color: '#E8EDF5' },
            { label: 'Base Burn',       value: '2% / epoch', color: '#FF3B3B' },
            { label: 'Mint Function',   value: 'NONE',       color: '#00F0B5' },
            { label: 'Buyback',         value: '15% surplus',color: '#7A5CFF' },
            { label: 'Reserve Floor',   value: '≥ 20%',      color: '#C9A227' },
          ].map((m) => (
            <div key={m.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${m.color}60, transparent)` }} />
              <div style={{ ...S.mono, fontSize: 'clamp(0.88rem,1.8vw,1.05rem)', fontWeight: 700, color: m.color }}>{m.value}</div>
              <div style={{ ...S.mono, fontSize: '0.53rem', color: '#4A5568', letterSpacing: '0.12em', marginTop: 5, textTransform: 'uppercase' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Parameters Table */}
      <section id="parameters" style={{ ...S.section }}>
        <p style={S.cap}>Token Parameters</p>
        <h2 style={S.h2}>Immutable Genesis Configuration.</h2>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden', marginBottom: 32 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {['Parameter', 'Value', 'Note'].map((h) => (
              <div key={h} style={{ ...S.mono, padding: '10px 18px', fontSize: '0.58rem', fontWeight: 700, color: '#8A9BB5', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {params.map((r, i) => (
            <div key={r.param} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', borderBottom: i < params.length-1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
              <div style={{ ...S.mono, padding: '13px 18px', fontSize: '0.7rem', color: '#8A9BB5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{r.param}</div>
              <div style={{ ...S.mono, padding: '13px 18px', fontSize: '0.78rem', fontWeight: 700, color: r.color }}>{r.value}</div>
              <div style={{ padding: '13px 18px', fontSize: '0.74rem', color: '#4A5568', fontFamily: 'Inter, system-ui, sans-serif' }}>{r.note}</div>
            </div>
          ))}
        </div>

        {/* Burn Formula Panel */}
        <div style={{ background: 'rgba(255,59,59,0.04)', border: '1px solid rgba(255,59,59,0.15)', borderRadius: 12, padding: '24px', marginBottom: 12 }}>
          <p style={{ ...S.cap, color: '#FF3B3B', marginBottom: 14 }}>Adaptive Burn Formula</p>
          <div style={{ ...S.mono, fontSize: 'clamp(1rem,2.5vw,1.4rem)', fontWeight: 700, color: '#FF3B3B', marginBottom: 12 }}>
            β(u) = 0.02 + κ · max(0, u − 0.5)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { var: 'β(u)', def: 'Burn rate at utilization u' },
              { var: 'u',    def: 'Network utilization [0,1]' },
              { var: 'κ',    def: '0.10 (sensitivity constant)' },
              { var: '0.5',  def: 'Threshold (50% utilization)' },
            ].map((v) => (
              <div key={v.var} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ ...S.mono, fontSize: '0.82rem', fontWeight: 700, color: '#FF3B3B' }}>{v.var}</span>
                <span style={{ ...S.mono, fontSize: '0.65rem', color: '#8A9BB5', display: 'block', marginTop: 2 }}>{v.def}</span>
              </div>
            ))}
          </div>
          <div style={{ ...S.mono, fontSize: '0.7rem', color: '#8A9BB5' }}>
            At 50% load: β = 2.0% · At 80% load: β = 2.0% + 0.10×0.30 = 2.3% · At 100% load: β = 2.5% (capped)
          </div>
        </div>

        {/* Supply Formula */}
        <div style={{ background: 'rgba(122,92,255,0.04)', border: '1px solid rgba(122,92,255,0.15)', borderRadius: 12, padding: '24px' }}>
          <p style={{ ...S.cap, color: '#7A5CFF', marginBottom: 14 }}>Supply Model</p>
          <div style={{ ...S.mono, fontSize: 'clamp(1rem,2.5vw,1.4rem)', fontWeight: 700, color: '#7A5CFF', marginBottom: 12 }}>
            S(t) = S₀ − B(t) − R(t) + E(t)
          </div>
          <div style={{ ...S.mono, fontSize: '0.68rem', color: '#8A9BB5', lineHeight: 2 }}>
            S₀ = 1,000,000,000 (genesis, fixed) · B(t) = cumulative epoch burns · R(t) = reserve lockups · E(t) = ecosystem emissions (vesting schedule)
          </div>
        </div>
      </section>

      {/* Token Roles */}
      <section style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <p style={S.cap}>Token Utility</p>
          <h2 style={S.h2}>Five On-Chain Roles. One Token.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {roles.map((r) => (
              <div key={r.id} className="gs-hud gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${r.color}`, borderRadius: 10, padding: '16px 22px', display: 'flex', gap: 18, alignItems: 'flex-start', position: 'relative' }}>
                <span style={{ ...S.mono, fontSize: '0.58rem', fontWeight: 700, color: r.color, background: `${r.color}12`, border: `1px solid ${r.color}20`, padding: '3px 9px', borderRadius: 4, letterSpacing: '0.1em', flexShrink: 0 }}>{r.id}</span>
                <div>
                  <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontWeight: 700, color: '#E8EDF5', marginBottom: 5, fontSize: '0.9rem' }}>{r.title}</div>
                  <p style={{ ...S.body, margin: 0, fontSize: '0.8rem' }}>{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Distribution */}
      <section style={{ ...S.section }}>
        <p style={S.cap}>Token Distribution</p>
        <h2 style={S.h2}>Genesis Allocation.</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 640 }}>
          {distribution.map((d) => (
            <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 120px', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.82rem', color: '#8A9BB5' }}>{d.label}</span>
              </div>
              <span style={{ ...S.mono, fontSize: '0.78rem', fontWeight: 700, color: d.color, textAlign: 'right' }}>{d.pct}%</span>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${d.pct * 100 / 35}%`, background: d.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...S.section, textAlign: 'center' }}>
        <p style={S.cap}>Get $GST</p>
        <h2 style={{ ...S.h2, fontSize: 'clamp(1.4rem,3vw,2.2rem)' }}>Own a Piece of the Autonomous Protocol.</h2>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
          <Link href="/site/investors" style={{ background: 'linear-gradient(135deg, #C9A227, #906e10)', color: '#0B0F14', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none' }}>Investor Relations</Link>
          <Link href="/site/whitepaper" style={{ background: 'rgba(201,162,39,0.08)', color: '#C9A227', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.25)' }}>Read Whitepaper</Link>
          <Link href="/site" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>Back to Overview</Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
