import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicNav, PublicFooter } from '../_components/PublicNav';

export const metadata: Metadata = {
  title: 'For Users — GhostStack',
  description: 'GhostWallet, GhostXchange, and the full GhostStack product suite. Faster, cheaper, AI-governed blockchain for everyday users.',
};

const S = {
  page:    { background: '#070B10', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  section: { maxWidth: 1100, margin: '0 auto', padding: 'clamp(64px,9vw,100px) clamp(16px,4vw,48px)' } as React.CSSProperties,
  cap:     { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', color: '#00F0B5', textTransform: 'uppercase' as const, marginBottom: 10 } as React.CSSProperties,
  h2:      { fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.3rem,2.8vw,1.9rem)', fontWeight: 700, letterSpacing: '0.06em', color: '#E8EDF5', textTransform: 'uppercase' as const, marginBottom: 14, marginTop: 0 } as React.CSSProperties,
  body:    { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.85rem', color: '#8A9BB5', lineHeight: 1.75 } as React.CSSProperties,
  mono:    { fontFamily: 'JetBrains Mono, monospace' } as React.CSSProperties,
};

const products = [
  {
    id: 'WALLET',
    name: 'GhostWallet',
    color: '#00F0B5',
    tagline: 'Self-custody. AI-secured. Multichain.',
    desc: 'A non-custodial smart-contract wallet secured by GhostSentinel AI. Supports L1/L2/L3 in one unified interface. No seed phrases exposed to the network.',
    features: ['Smart contract wallet (EIP-4337)', 'Biometric + hardware key support', 'AI fraud detection (real-time)', 'L1 → L3 asset bridging built-in', 'Gasless meta-transactions on L3'],
  },
  {
    id: 'XCHANGE',
    name: 'GhostXchange',
    color: '#00C2FF',
    tagline: 'Protocol-native exchange. Zero custody risk.',
    desc: 'Decentralized exchange running natively on L2. AI-optimized routing across pools and external DEXs for best execution. No wrap-and-hope.',
    features: ['AI best-execution routing', 'L2-native liquidity pools', 'Cross-chain swaps (L1↔L2↔L3)', 'Slippage prediction engine', 'Constitutional fee model (0.15%)'],
  },
  {
    id: 'STAKE',
    name: 'GhostStake',
    color: '#7A5CFF',
    tagline: 'Earn yield. Secure the network.',
    desc: 'Stake $GST to earn validator rewards. GhostSentinel monitors slashing conditions in real-time. Delegated and native staking paths available.',
    features: ['Delegated staking (no node required)', 'Native validator staking (≥10K GST)', 'AI slashing risk monitor', '8–22% APY depending on scenario', 'Auto-compound rewards'],
  },
  {
    id: 'VAULT',
    name: 'GhostVault',
    color: '#C9A227',
    tagline: 'AI-governed yield optimization.',
    desc: 'Deposit assets into constitutional yield strategies. GhostAI allocates across DeFi protocols within risk bounds set by the treasury constitution.',
    features: ['Automated rebalancing (daily)', 'ZK proof of reserves', 'Configurable risk profiles', 'Constitutional risk limits enforced', 'No discretionary manager'],
  },
];

const benefits = [
  { metric: '< 200ms',    label: 'L3 block time',       color: '#00C2FF', desc: 'Near-instant transaction finality on L3 for everyday operations.' },
  { metric: '< $0.001',   label: 'Avg L3 tx fee',       color: '#00F0B5', desc: 'AI-optimized fee model keeps user costs minimal at scale.' },
  { metric: '99.98%',     label: 'Network uptime',       color: '#7A5CFF', desc: 'Redundant validator set with AI-coordinated failover.' },
  { metric: '512 TPS',    label: 'L3 throughput',        color: '#C9A227', desc: 'Scales with demand via dynamic block gas limit adjustment.' },
  { metric: 'EIP-4337',   label: 'Account abstraction',  color: '#00F0B5', desc: 'Gas sponsorship, batch transactions, biometric signing.' },
  { metric: 'ZK Proofs',  label: 'Privacy option',       color: '#7A5CFF', desc: 'Optional ZK shielded transactions on L2.' },
];

const howItWorks = [
  { step: '01', title: 'Create Your Wallet',       color: '#00F0B5', body: 'Deploy a smart contract wallet in under 30 seconds. No seed phrase exposure. Biometric + hardware key options from day one.' },
  { step: '02', title: 'Bridge or Buy $GST',       color: '#00C2FF', body: 'Fund your wallet via GhostXchange or bridge from any EVM chain. AI routing finds the best rate automatically.' },
  { step: '03', title: 'Use the Network',          color: '#7A5CFF', body: 'Swap, stake, deploy apps, or earn yield on GhostVault — all governed by constitutional AI that protects your assets.' },
  { step: '04', title: 'Earn and Participate',     color: '#C9A227', body: 'Stake $GST to secure the network and earn rewards. Vote on governance proposals. Own a share of the sovereign infrastructure.' },
];

export default function UsersPage() {
  return (
    <div style={S.page}>
      <PublicNav />

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(0,240,181,0.08)' }}>
        <div className="gs-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 60% -10%, rgba(0,240,181,0.08) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div style={{ ...S.section, paddingTop: 'clamp(72px,10vw,108px)', paddingBottom: 56, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <span className="gs-dot-teal" style={{ width: 7, height: 7, borderRadius: '50%', background: '#00F0B5', display: 'inline-block' }} />
            <span style={{ ...S.mono, fontSize: '0.6rem', fontWeight: 700, color: '#00F0B5', letterSpacing: '0.18em' }}>FOR USERS · AI-GOVERNED · SELF-CUSTODIAL</span>
          </div>
          <h1 style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.8rem,4vw,3rem)', fontWeight: 700, letterSpacing: '0.04em', color: '#E8EDF5', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 20 }}>
            Banking for the<br /><span style={{ color: '#00F0B5' }}>Autonomous Age.</span>
          </h1>
          <p style={{ ...S.body, maxWidth: 560, fontSize: '0.95rem', marginBottom: 32 }}>
            GhostStack delivers fast, cheap, AI-secured financial infrastructure to everyday users.
            Self-custody wallets, AI-routed swaps, constitutional yield — all on network fees under $0.001.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="#products" style={{ background: 'linear-gradient(135deg, #00F0B5, #00a880)', color: '#070B10', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>Explore Products ↓</Link>
            <Link href="/site/whitepaper" style={{ background: 'rgba(0,240,181,0.07)', color: '#00F0B5', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(0,240,181,0.2)' }}>How It Works</Link>
          </div>
        </div>
      </section>

      {/* Network Benefits Strip */}
      <div style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px clamp(16px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 10 }}>
          {benefits.map((b) => (
            <div key={b.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${b.color}60, transparent)` }} />
              <div style={{ ...S.mono, fontSize: 'clamp(0.9rem,1.8vw,1.1rem)', fontWeight: 700, color: b.color }}>{b.metric}</div>
              <div style={{ ...S.mono, fontSize: '0.53rem', color: '#4A5568', letterSpacing: '0.12em', marginTop: 5, textTransform: 'uppercase' }}>{b.label}</div>
              <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.7rem', color: '#8A9BB5', marginTop: 6, lineHeight: 1.4 }}>{b.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Products */}
      <section id="products" style={{ ...S.section }}>
        <p style={S.cap}>Product Suite</p>
        <h2 style={S.h2}>Everything You Need. Nothing You Don't.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px,1fr))', gap: 14 }}>
          {products.map((p) => (
            <div key={p.id} className="gs-hud gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${p.color}, transparent)` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ ...S.mono, fontSize: '0.58rem', fontWeight: 700, color: p.color, background: `${p.color}12`, border: `1px solid ${p.color}25`, padding: '3px 9px', borderRadius: 4, letterSpacing: '0.12em' }}>{p.id}</span>
                <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#E8EDF5' }}>{p.name}</span>
              </div>
              <p style={{ ...S.body, fontSize: '0.78rem', marginBottom: 16, margin: '0 0 16px' }}>{p.desc}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {p.features.map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ color: p.color, fontSize: '0.65rem', flexShrink: 0 }}>▸</span>
                    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.74rem', color: '#8A9BB5' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <p style={S.cap}>How It Works</p>
          <h2 style={S.h2}>Four Steps to Sovereign Finance.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
            {howItWorks.map((h) => (
              <div key={h.step} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '22px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${h.color}, transparent)` }} />
                <div style={{ ...S.mono, fontSize: '1.8rem', fontWeight: 700, color: `${h.color}30`, letterSpacing: '-0.02em', marginBottom: 12 }}>{h.step}</div>
                <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontWeight: 700, color: '#E8EDF5', marginBottom: 8 }}>{h.title}</div>
                <p style={{ ...S.body, margin: 0, fontSize: '0.78rem' }}>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section style={{ ...S.section }}>
        <p style={S.cap}>Security Architecture</p>
        <h2 style={S.h2}>Your Assets. Protected by Constitutional AI.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { color: '#FF3B3B', title: 'GhostSentinel AI',        body: 'Real-time fraud detection, slashing risk monitoring, anomaly detection. Blocks malicious transactions before they execute.' },
            { color: '#00F0B5', title: 'Smart Contract Custody',   body: 'No EOA controls your funds. Assets are held in audited smart contracts governed by constitutional rules.' },
            { color: '#7A5CFF', title: 'ZK Proof of Reserves',     body: 'Cryptographically verify that treasury holdings match claimed reserves. Quarterly proofs, publicly verifiable.' },
            { color: '#C9A227', title: 'Constitutional Governance', body: 'No parameter can be changed without on-chain governance + timelock. No backdoors, no admin keys.' },
          ].map((s) => (
            <div key={s.title} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: '18px 22px' }}>
              <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontWeight: 700, color: '#E8EDF5', marginBottom: 6, fontSize: '0.9rem' }}>{s.title}</div>
              <p style={{ ...S.body, margin: 0, fontSize: '0.8rem' }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...S.section, textAlign: 'center' }}>
        <p style={S.cap}>Get Started</p>
        <h2 style={{ ...S.h2, fontSize: 'clamp(1.4rem,3vw,2.2rem)' }}>Join the Autonomous Network.</h2>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
          <Link href="/site/token" style={{ background: 'linear-gradient(135deg, #00F0B5, #00a880)', color: '#070B10', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none' }}>$GST Token</Link>
          <Link href="/site/developers" style={{ background: 'rgba(0,240,181,0.07)', color: '#00F0B5', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(0,240,181,0.2)' }}>Build on GhostStack</Link>
          <Link href="/site" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>Back to Overview</Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
