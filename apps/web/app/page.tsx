import type { Metadata } from 'next';
import { PublicNav, PublicFooter } from './site/_components/PublicNav';
import styles from './portal.module.css';

export const metadata: Metadata = {
  title: 'GhostChain — Sovereign Multichain Stack',
  description:
    'GhostChain is an AI-governed sovereign multichain federation delivering constitutional governance, energy-efficient consensus, and long-horizon digital sovereignty.',
  openGraph: {
    title: 'GhostChain — Sovereign Multichain Stack',
    description:
      'GhostChain: L1 settlement · GhostL2 liquidity · GhostL3 execution · Hyper Ghost AI governance.',
    type: 'website',
    siteName: 'GhostChain',
    locale: 'en_US',
  },
};

/* ── Design tokens ─────────────────────────────────────────────────────── */
const C = {
  bg:       '#070B10',
  surface:  'rgba(255,255,255,0.028)',
  border:   'rgba(255,255,255,0.07)',
  text:     '#E8EDF5',
  muted:    '#8A9BB5',
  dim:      '#4A5568',
  purple:   '#7A5CFF',
  blue:     '#00C2FF',
  teal:     '#00F0B5',
  gold:     '#C9A227',
  red:      '#FF3B3B',
  mono:     "'JetBrains Mono', monospace",
  sans:     "'Inter', system-ui, sans-serif",
  display:  "'Orbitron', system-ui, sans-serif",
} as const;

/* ── Portal definitions ───────────────────────────────────────────────── */
// In development (no NEXT_PUBLIC_BASE_DOMAIN set), links resolve locally.
// In production set NEXT_PUBLIC_BASE_DOMAIN=ghostchain.cloud for subdomain URLs.
const _base = process.env.NEXT_PUBLIC_BASE_DOMAIN;
const _u = (sub: string, localPath: string) =>
  _base ? `https://${sub}.${_base}` : localPath;

const PORTALS = [
  {
    id:    'app',
    badge: 'L3',
    color: C.blue,
    title: 'User App',
    desc:  'GhostWallet, GhostXchange, bridge, transaction history, portfolio, and dApp ecosystem.',
    href:  _u('app', '/dashboard'),
    auth:  'Wallet auth',
  },
  {
    id:    'admin',
    badge: 'OPS',
    color: C.red,
    title: 'Admin Console',
    desc:  'Chain controls, node management, validator ops, compliance, KYC, and service orchestration.',
    href:  _u('admin', '/command-hub'),
    auth:  'SSO + MFA required',
  },
  {
    id:    'investor',
    badge: 'L1',
    color: C.gold,
    title: 'Investor Portal',
    desc:  'Treasury dashboard, ZK-solvency proofs, revenue flows, burn reports, and 5-year projections.',
    href:  _u('investor', '/site/investors'),
    auth:  'Gated · SSO',
  },
  {
    id:    'employee',
    badge: 'INT',
    color: C.muted,
    title: 'Employee Portal',
    desc:  'HRMS, internal tooling, onboarding flows, payroll, and policy documentation.',
    href:  _u('employee', '/support'),
    auth:  'OIDC · allowlist IP',
  },
  {
    id:    'dev',
    badge: 'L2',
    color: C.purple,
    title: 'Developer Portal',
    desc:  'SDKs, RPC endpoints, API keys, testnet faucets, grants program, and audit resources.',
    href:  _u('dev', '/site/developers'),
    auth:  'Public + gated keys',
  },
  {
    id:    'validators',
    badge: 'AI',
    color: C.teal,
    title: 'Validator Portal',
    desc:  'Stake management, slashing risk monitor, epoch rewards, IBFT telemetry, and node health.',
    href:  _u('validators', '/validators'),
    auth:  'Validator key auth',
  },
  {
    id:    'explorer',
    badge: 'L3',
    color: C.blue,
    title: 'Block Explorer',
    desc:  'Blocks, transactions, contracts, tokens, and cross-chain bridge activity across all layers.',
    href:  _u('explorer', '/explorer/txs'),
    auth:  'Public',
  },
  {
    id:    'docs',
    badge: 'L2',
    color: C.purple,
    title: 'Documentation',
    desc:  'Architecture guides, API references, constitutional rules, SDK docs, and runbooks.',
    href:  _u('docs', '/site/whitepaper'),
    auth:  'Public',
  },
  {
    id:    'status',
    badge: 'AI',
    color: C.teal,
    title: 'Status',
    desc:  'Real-time system health, incident reports, uptime history, and planned maintenance windows.',
    href:  _u('status', '/status'),
    auth:  'Public',
  },
  {
    id:    'governance',
    badge: 'L1',
    color: C.gold,
    title: 'Governance',
    desc:  'On-chain proposals, voting, timelock queue, constitutional amendments, and quorum tracking.',
    href:  _u('governance', '/governance'),
    auth:  'GST token required',
  },
];

/* ── Ecosystem domains ────────────────────────────────────────────────── */
const ECOSYSTEM = [
  { domain: 'ghostchain.info',       label: 'About & FAQs',       description: 'About, explainers, frequently asked questions' },
  { domain: 'ghostchain.life',       label: 'Community',          description: 'Culture, careers, community hub' },
  { domain: 'ghostchain.live',       label: 'Live',               description: 'Streaming and live product events' },
  { domain: 'ghostchain.online',     label: 'Online',             description: 'Redirect → ghostchain.cloud' },
  { domain: 'ghostchain.space',      label: 'Infrastructure',     description: 'Node infrastructure and validator program' },
  { domain: 'ghostchain.store',      label: 'Store',              description: 'Merch and digital goods' },
  { domain: 'ghostchain.world',      label: 'World',              description: 'Global presence and multi-region story' },
  { domain: 'ghostchainlink.com',    label: 'Bridge',             description: 'Bridging and interoperability' },
  { domain: 'ghostchainsolutions.com', label: 'Solutions',        description: 'Enterprise and B2B services' },
  { domain: 'ghostschain.com',       label: 'Redirect',           description: 'Common misspelling → ghostchain.cloud' },
] as const;

/* ── Security tiers ───────────────────────────────────────────────────── */
const SECURITY = [
  { tier: 'Public',      color: C.teal,   items: ['Explorer', 'Docs', 'Status'] },
  { tier: 'Wallet Auth', color: C.blue,   items: ['User App', 'Governance'] },
  { tier: 'SSO + MFA',   color: C.gold,   items: ['Investor Portal', 'Developer Portal'] },
  { tier: 'SSO + MFA + IP Allowlist', color: C.red, items: ['Admin Console', 'Employee Portal', 'Validator Portal'] },
] as const;

/* ── Shared inline style helpers ──────────────────────────────────────── */
function mono(extra?: React.CSSProperties): React.CSSProperties {
  return { fontFamily: C.mono, ...extra };
}
function sans(extra?: React.CSSProperties): React.CSSProperties {
  return { fontFamily: C.sans, ...extra };
}

/* =========================================================================
   Page component
   ========================================================================= */

export default function PortalHubPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <PublicNav />

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: '52vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* Animated grid */}
        <div
          className={styles.gridBg}
          style={{ position: 'absolute', inset: 0, opacity: 0.45 }}
        />
        {/* Scan line */}
        <div
          className={styles.scanLine}
          style={{ position: 'absolute', inset: 0 }}
        />
        {/* Radial glows */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 1100, height: 540, background: `radial-gradient(ellipse, rgba(122,92,255,0.12) 0%, transparent 58%)`, borderRadius: '50%' }} />
          <div style={{ position: 'absolute', top: '30%',  left: '4%',   width: 420, height: 300, background: `radial-gradient(ellipse, rgba(0,240,181,0.06) 0%, transparent 65%)` }} />
          <div style={{ position: 'absolute', top: '10%',  right: '6%',  width: 360, height: 280, background: `radial-gradient(ellipse, rgba(201,162,39,0.07) 0%, transparent 65%)` }} />
        </div>

        {/* Hero content */}
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(72px,10vw,110px) clamp(16px,4vw,48px) clamp(56px,8vw,88px)', position: 'relative', textAlign: 'center' }}>
          {/* Live badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '5px 18px', borderRadius: 999, background: 'rgba(0,240,181,0.06)', border: '1px solid rgba(0,240,181,0.22)' }}>
              <span
                className={styles.dotTeal}
                style={{ width: 7, height: 7, borderRadius: '50%', background: C.teal, display: 'inline-block', flexShrink: 0 }}
              />
              <span style={mono({ fontSize: '0.61rem', fontWeight: 700, color: C.teal, letterSpacing: '0.15em' })}>
                LIVE · GHOSTCHAIN.CLOUD
              </span>
              <span style={mono({ fontSize: '0.57rem', color: C.dim, letterSpacing: '0.1em' })}>BLOCK #2,847,331</span>
            </div>
          </div>

          {/* Headline */}
          <h1 style={{ fontFamily: C.display, fontSize: 'clamp(2.4rem,6vw,4.2rem)', fontWeight: 800, letterSpacing: '0.04em', margin: '0 0 18px', lineHeight: 1.1, textTransform: 'uppercase', color: C.text }}>
            Ghost<span style={{ color: C.purple }}>Chain</span>
          </h1>

          {/* Tagline */}
          <p style={sans({ fontSize: 'clamp(1rem,2.2vw,1.3rem)', color: C.muted, maxWidth: 660, margin: '0 auto 14px', lineHeight: 1.6 })}>
            Sovereign Multichain Stack — Select your portal below.
          </p>

          {/* Layer badges */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
            {[
              { label: 'GhostChain L1',  color: C.gold },
              { label: 'GhostL2',        color: C.purple },
              { label: 'GhostL3',        color: C.blue },
              { label: 'Hyper Ghost AI', color: C.teal },
            ].map(({ label, color }) => (
              <span key={label} style={mono({ fontSize: '0.6rem', fontWeight: 700, color, background: `${color}12`, border: `1px solid ${color}28`, padding: '4px 12px', borderRadius: 5, letterSpacing: '0.12em', textTransform: 'uppercase' })}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PORTAL GRID ───────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px,6vw,72px) clamp(16px,4vw,48px) clamp(32px,4vw,48px)' }}>
        {/* Section heading */}
        <div style={{ marginBottom: 32 }}>
          <div style={mono({ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.22em', color: C.purple, textTransform: 'uppercase', marginBottom: 10 })}>
            PORTAL DIRECTORY
          </div>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(1.1rem,2.2vw,1.5rem)', fontWeight: 700, letterSpacing: '0.06em', color: C.text, margin: 0, textTransform: 'uppercase' }}>
            Select Your Portal
          </h2>
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {PORTALS.map((p) => (
            <a
              key={p.id}
              href={p.href}
              className={styles.portalCard}
              style={
                {
                  background: C.surface,
                  border: `1px solid ${p.color}28`,
                  '--card-glow': `${p.color}1A`,
                } as React.CSSProperties & { '--card-glow': string }
              }
            >
              {/* Top row: badge + auth tag */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={mono({ fontSize: '0.6rem', fontWeight: 700, color: p.color, background: `${p.color}14`, border: `1px solid ${p.color}28`, padding: '3px 9px', borderRadius: 4, letterSpacing: '0.12em' })}>
                  {p.badge}
                </span>
                <span style={mono({ fontSize: '0.55rem', color: C.dim, letterSpacing: '0.08em' })}>
                  {p.auth}
                </span>
              </div>

              {/* Title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={sans({ fontSize: '1rem', fontWeight: 700, color: C.text, letterSpacing: '0.01em', lineHeight: 1.25 })}>
                  {p.title}
                </span>
                <span style={{ color: p.color, fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>→</span>
              </div>

              {/* Description */}
              <p style={sans({ fontSize: '0.78rem', color: C.muted, lineHeight: 1.65, margin: '0 0 14px', flexGrow: 1 })}>
                {p.desc}
              </p>

              {/* URL */}
              <div style={{ borderTop: `1px solid ${p.color}16`, paddingTop: 10, marginTop: 'auto' }}>
                <span style={mono({ fontSize: '0.62rem', color: `${p.color}AA`, letterSpacing: '0.04em', wordBreak: 'break-all' })}>
                  {p.href.replace('https://', '')}
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── SECURITY TIERS ─────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.15)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(32px,5vw,56px) clamp(16px,4vw,48px)' }}>
          <div style={mono({ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.22em', color: C.dim, textTransform: 'uppercase', marginBottom: 20 })}>
            ACCESS CONTROL
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {SECURITY.map((s) => (
              <div key={s.tier} style={{ background: `${s.color}08`, border: `1px solid ${s.color}1E`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={mono({ fontSize: '0.6rem', fontWeight: 700, color: s.color, letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' })}>
                  {s.tier}
                </div>
                {s.items.map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={sans({ fontSize: '0.76rem', color: C.muted })}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ECOSYSTEM DOMAINS ──────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(48px,6vw,64px) clamp(16px,4vw,48px)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={mono({ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.22em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 })}>
            ECOSYSTEM
          </div>
          <h2 style={{ fontFamily: C.display, fontSize: 'clamp(1rem,2vw,1.3rem)', fontWeight: 700, letterSpacing: '0.06em', color: C.text, margin: 0, textTransform: 'uppercase' }}>
            GhostChain Network Domains
          </h2>
          <p style={sans({ fontSize: '0.8rem', color: C.muted, marginTop: 8, maxWidth: 580 })}>
            Specialized campaign and brand domains that route back into the GhostChain ecosystem via 301 redirects or focused landing pages.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ECOSYSTEM.map(({ domain, label, description }) => (
            <a
              key={domain}
              href={`https://${domain}`}
              className={styles.domainPill}
              title={description}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.purple, display: 'inline-block', opacity: 0.6, flexShrink: 0 }} />
              <span style={{ color: C.muted }}>{domain}</span>
              <span style={{ color: C.dim }}>— {label}</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── ROUTING LAW CALLOUT ────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto 0', padding: '0 clamp(16px,4vw,48px) clamp(40px,5vw,56px)' }}>
        <div style={{ background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.18)', borderRadius: 12, padding: 'clamp(20px,3vw,28px) clamp(20px,3vw,32px)', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={mono({ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.18em', color: C.purple, textTransform: 'uppercase', marginBottom: 6 })}>
              CONSTITUTIONAL ROUTING LAW
            </div>
            <div style={sans({ fontSize: '0.84rem', color: C.muted, maxWidth: 520 })}>
              All cross-chain messages route{' '}
              <span style={mono({ color: C.blue })}>L3 → L2</span>{' '}
              then{' '}
              <span style={mono({ color: C.gold })}>L2 → L1</span>.
              Direct L3 → L1 bypass is{' '}
              <span style={{ color: C.red, fontWeight: 600 }}>forbidden</span>{' '}
              and enforced at the contract level and in CI.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {[
              { label: 'L3', color: C.blue },
              { label: '→', color: C.dim },
              { label: 'L2', color: C.purple },
              { label: '→', color: C.dim },
              { label: 'L1', color: C.gold },
            ].map(({ label, color }, i) => (
              <span key={i} style={mono({ fontSize: label === '→' ? '0.8rem' : '0.88rem', fontWeight: 700, color, letterSpacing: '0.06em' })}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

