'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GhostWordmark } from '@/components/brand/GhostMark';

const NAV = [
  { href: '/site',            label: 'Overview'   },
  { href: '/site/users',      label: 'Users'      },
  { href: '/site/investors',  label: 'Investors'  },
  { href: '/site/token',      label: '$GST'       },
  { href: '/site/developers', label: 'Developers' },
  { href: '/site/whitepaper', label: 'Whitepaper' },
];

const TICKER_ITEMS = [
  { label: 'GhostChain L1', value: 'LIVE',        color: '#00F0B5' },
  { label: 'Block',         value: '#2,847,331',   color: '#8A9BB5' },
  { label: 'Avg Block',     value: '1.9s',         color: '#8A9BB5' },
  { label: 'GST Supply',    value: '1,000,000,000',color: '#C9A227' },
  { label: 'Base Burn',     value: '2.00%/epoch',  color: '#FF3B3B' },
  { label: 'Reserve',       value: '≥ 20%',        color: '#00F0B5' },
  { label: 'L3→L2→L1',     value: 'ROUTING OK',   color: '#7A5CFF' },
  { label: 'Validators',    value: '127 active',   color: '#00C2FF' },
  { label: 'AI Systems',    value: '4 ONLINE',     color: '#00F0B5' },
  { label: 'Network Load',  value: '38%',          color: '#8A9BB5' },
  { label: 'Uptime',        value: '99.97%',       color: '#00F0B5' },
  { label: 'Phase',         value: 'Foundation',   color: '#7A5CFF' },
];

export function PublicNav() {
  const pathname = usePathname();

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 300 }}>
      {/* ── Main bar ─────────────────────────────────────────────────── */}
      <nav style={{
        background: 'rgba(7,11,16,0.96)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(122,92,255,0.18)',
        height: 58,
        display: 'flex', alignItems: 'center',
        padding: '0 clamp(14px, 3vw, 40px)',
        gap: 24,
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <GhostWordmark size={24} />
        </Link>

        {/* Network status chip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(0,240,181,0.07)', border: '1px solid rgba(0,240,181,0.2)',
          borderRadius: 999, padding: '3px 10px', flexShrink: 0,
        }}>
          <span
            className="gs-dot-teal"
            style={{ width: 6, height: 6, borderRadius: '50%', background: '#00F0B5', display: 'inline-block' }}
          />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, color: '#00F0B5', letterSpacing: '0.12em' }}>
            LIVE
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, justifyContent: 'center' }}>
          {NAV.map((item) => {
            const isActive = item.href === '/site'
              ? pathname === '/site'
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="gs-nav-link"
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.76rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#E8EDF5' : '#8A9BB5',
                  letterSpacing: '0.04em', textDecoration: 'none',
                  padding: '5px 11px', borderRadius: 5,
                  background: isActive ? 'rgba(122,92,255,0.12)' : 'transparent',
                  borderBottom: isActive ? '1px solid rgba(122,92,255,0.5)' : '1px solid transparent',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <a href="http://management.localhost:3200" style={{
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', fontWeight: 500,
            color: '#8A9BB5', textDecoration: 'none', padding: '5px 12px', borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
          }}>
            Dashboard
          </a>
          <a href="http://management.localhost:3200/login" className="gs-btn-primary" style={{
            background: 'linear-gradient(135deg, #7A5CFF 0%, #4A2CDF 100%)',
            color: '#fff', padding: '7px 18px', borderRadius: 7,
            fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.06em',
            textDecoration: 'none', boxShadow: '0 0 20px rgba(122,92,255,0.3)',
          }}>
            Sign In →
          </a>
        </div>
      </nav>

      {/* ── Ticker bar ───────────────────────────────────────────────── */}
      <div style={{
        height: 28, background: 'rgba(7,11,16,0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        overflow: 'hidden', display: 'flex', alignItems: 'center',
      }}>
        <div style={{ flexShrink: 0, background: 'rgba(122,92,255,0.15)', borderRight: '1px solid rgba(122,92,255,0.2)', padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.55rem', fontWeight: 700, color: '#7A5CFF', letterSpacing: '0.18em' }}>NETWORK</span>
        </div>
        <div className="gs-ticker-wrap" style={{ flex: 1 }}>
          <div className="gs-ticker-inner" style={{ gap: 0 }}>
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 20px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.55rem', color: '#4A5568', letterSpacing: '0.1em' }}>{item.label}</span>
                <span style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', display: 'inline-block' }} />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.55rem', fontWeight: 700, color: item.color, letterSpacing: '0.1em' }}>{item.value}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const cols = [
    { title: 'Platform', links: [
      { href: '/site',            label: 'Overview'           },
      { href: '/site/users',      label: 'For Users'          },
      { href: '/site/developers', label: 'For Developers'     },
      { href: '/site/token',      label: '$GST Token'         },
      { href: '/site/whitepaper', label: 'Whitepaper'         },
    ]},
    { title: 'Investors', links: [
      { href: '/site/investors',          label: 'Investor Relations'    },
      { href: '/site/investors#projections', label: 'Financial Projections' },
      { href: '/site/token',              label: 'Token Economics'       },
      { href: '/site/whitepaper#economics', label: 'Economic Model'      },
    ]},
    { title: 'Protocol', links: [
      { href: '/site/whitepaper#architecture', label: 'Architecture'         },
      { href: '/site/whitepaper#constitution', label: 'Constitutional Rules' },
      { href: '/site/whitepaper#ai',           label: 'AI Governance'        },
      { href: '/site/whitepaper#security',     label: 'Security Model'       },
    ]},
    { title: 'Management', links: [
      { href: 'http://management.localhost:3200',         label: 'Operator Dashboard' },
      { href: 'http://management.localhost:3200/econ',    label: 'Economy'            },
      { href: 'http://management.localhost:3200/login',   label: 'Sign In'            },
    ]},
  ];

  return (
    <footer style={{ background: '#050810', borderTop: '1px solid rgba(122,92,255,0.12)' }}>
      {/* Status bar */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,240,181,0.03)',
        padding: '12px clamp(16px,4vw,48px)',
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="gs-dot-teal" style={{ width: 7, height: 7, borderRadius: '50%', background: '#00F0B5', display: 'inline-block' }} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#00F0B5', letterSpacing: '0.12em', fontWeight: 700 }}>ALL SYSTEMS OPERATIONAL</span>
        </div>
        {[
          { label: 'GhostChain L1', color: '#00F0B5' },
          { label: 'GhostL2',       color: '#7A5CFF' },
          { label: 'GhostL3',       color: '#00C2FF' },
          { label: 'Hyper Ghost AI', color: '#00F0B5' },
          { label: 'GhostSentinel', color: '#FF3B3B' },
        ].map((s) => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.56rem', color: '#8A9BB5', letterSpacing: '0.1em' }}>{s.label}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.56rem', color: '#4A5568', letterSpacing: '0.1em' }}>
          LAST UPDATED: BLOCK #2,847,331
        </span>
      </div>

      {/* Main footer */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(40px,6vw,64px) clamp(16px,4vw,48px) 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, auto)', gap: 'clamp(32px, 4vw, 64px)', alignItems: 'start' }}>
          {/* Brand */}
          <div>
            <GhostWordmark size={26} showTagline />
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem', color: '#8A9BB5', lineHeight: 1.7, marginTop: 14, maxWidth: 260 }}>
              AI-governed sovereign multichain federation. Constitutional governance, energy-efficient consensus, long-horizon digital sovereignty.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'L1', c: '#C9A227' }, { label: 'L2', c: '#7A5CFF' },
                { label: 'L3', c: '#00C2FF' }, { label: 'AI', c: '#00F0B5' },
              ].map(({ label, c }) => (
                <span key={label} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, color: c, background: `${c}12`, border: `1px solid ${c}25`, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.1em' }}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {cols.map((col) => (
            <div key={col.title}>
              <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 14 }}>
                {col.title}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.links.map((l) => (
                  <Link key={`${l.href}${l.label}`} href={l.href} style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem', color: '#8A9BB5', textDecoration: 'none', transition: 'color 0.15s' }}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          marginTop: 48, paddingTop: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.68rem', color: '#4A5568' }}>
            © 2026 GhostStack Foundation. All rights reserved. Licensed under{' '}
            <span style={{ color: '#8A9BB5' }}>UNLICENSED</span>.
          </span>
          <div style={{ display: 'flex', gap: 0 }}>
            {['Governance is code', 'Intelligence is enforced', 'Sovereignty is engineered'].map((line, i) => (
              <span key={line} style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.55rem', fontWeight: 600, color: '#7A5CFF', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>
                {i > 0 && <span style={{ margin: '0 10px', color: '#4A5568' }}>·</span>}
                {line}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
