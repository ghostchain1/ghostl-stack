'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV: { href: string; label: string; icon: string }[] = [
  { href: '/portal/dashboard',   label: 'Dashboard',   icon: '⬡' },
  { href: '/portal/chains',      label: 'Chains',      icon: '⛓' },
  { href: '/portal/nodes',       label: 'Nodes',       icon: '◉' },
  { href: '/portal/validators',  label: 'Validators',  icon: '⬡' },
  { href: '/portal/docker',      label: 'Docker',      icon: '□' },
  { href: '/portal/hypervisor',  label: 'Hypervisor',  icon: '◈' },
  { href: '/portal/ai',          label: 'AI Systems',  icon: '◆' },
  { href: '/portal/treasury',    label: 'Treasury',    icon: '◈' },
  { href: '/portal/governance',  label: 'Governance',  icon: '⊡' },
  { href: '/portal/domains',     label: 'Domains',     icon: '◎' },
  { href: '/portal/users',       label: 'Users',       icon: '○' },
  { href: '/portal/security',    label: 'Security',    icon: '⊕' },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const path = usePathname();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '216px 1fr', minHeight: '100%' }}>
      {/* Secondary portal sidebar */}
      <aside
        style={{
          background: 'rgba(6,9,18,0.7)',
          borderRight: '1px solid var(--border)',
          padding: '18px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '8px 10px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700 }}>
            GhostStack Portal
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            Universal Management
          </div>
        </div>
        {NAV.map((item) => {
          const active = path === item.href || (item.href !== '/portal/dashboard' && (path ?? '').startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--muted)',
                background: active ? 'rgba(35, 214, 166, 0.08)' : 'transparent',
                border: active ? '1px solid rgba(35,214,166,0.18)' : '1px solid transparent',
                transition: 'all 0.15s ease',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.8 }}>{item.icon}</span>
              {item.label}
              {active && (
                <span
                  style={{
                    marginLeft: 'auto',
                    width: 5, height: 5,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    flexShrink: 0,
                  }}
                />
              )}
            </Link>
          );
        })}
      </aside>

      {/* Portal main content */}
      <main style={{ padding: '28px 32px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
