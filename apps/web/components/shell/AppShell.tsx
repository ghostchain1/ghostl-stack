'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { REALM_NAV, type Realm } from '@/lib/realms';

const REALM_LABEL: Record<Realm, string> = {
  users: 'User Portal',
  employees: 'Employee Portal',
  admins: 'Admin Portal',
};

const REALM_BADGE_COLOR: Record<Realm, string> = {
  users: 'rgba(35,214,166,0.18)',
  employees: 'rgba(122,162,255,0.18)',
  admins: 'rgba(242,193,78,0.18)',
};

export function AppShell({ realm, children }: { realm: Realm; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = REALM_NAV[realm];

  const SidebarContent = () => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <span style={{
          width: 14, height: 14, borderRadius: 5,
          background: 'linear-gradient(135deg,var(--accent),var(--accent-2))',
          boxShadow: '0 0 16px var(--glow)',
          flexShrink: 0,
        }} />
        <span style={{ fontWeight: 700, fontSize: '1.05rem', fontFamily: 'var(--font-display)' }}>GhostChain</span>
      </div>
      <div style={{
        display: 'inline-flex', padding: '3px 10px', borderRadius: 999,
        background: REALM_BADGE_COLOR[realm], fontSize: '0.72rem',
        textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 18,
        color: 'var(--accent)', fontWeight: 700,
      }}>{REALM_LABEL[realm]}</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                padding: '10px 14px', borderRadius: 12,
                color: isActive ? 'var(--text)' : 'var(--muted)',
                background: isActive
                  ? 'linear-gradient(120deg,rgba(35,214,166,0.16),rgba(242,193,78,0.1))'
                  : 'transparent',
                border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
                fontWeight: isActive ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background 0.15s,color 0.15s',
                transform: isActive ? 'translateX(3px)' : 'none',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
      {/* Desktop sidebar */}
      <aside className="realm-sidebar" style={{
        width: 260, flexShrink: 0,
        background: 'linear-gradient(180deg,rgba(11,16,26,0.97),rgba(6,9,18,0.99))',
        borderRight: '1px solid var(--border)',
        padding: 22, display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            zIndex: 40, display: 'none',
          }}
          className="mobile-overlay"
        />
      )}

      {/* Mobile drawer */}
      <aside className={`realm-drawer${mobileOpen ? ' open' : ''}`} style={{
        position: 'fixed', top: 0, left: 0, height: '100%', width: 270, zIndex: 50,
        background: 'linear-gradient(180deg,rgba(8,12,22,0.99),rgba(5,8,16,1))',
        borderRight: '1px solid var(--border)',
        padding: 22, display: 'none', flexDirection: 'column',
        transform: 'translateX(-100%)', transition: 'transform 0.25s ease',
        overflowY: 'auto',
      }}>
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          style={{
            alignSelf: 'flex-end', marginBottom: 16, background: 'none',
            border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 22,
          }}
        >✕</button>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Mobile topbar */}
        <div className="realm-mobile-topbar" style={{
          display: 'none', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          background: 'rgba(7,10,21,0.85)', backdropFilter: 'blur(14px)',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Open menu"
            style={{
              background: 'none', border: 'none', color: 'var(--text)',
              cursor: 'pointer', fontSize: 20, padding: 4,
            }}
          >☰</button>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', fontFamily: 'var(--font-display)' }}>
            GhostChain · {REALM_LABEL[realm]}
          </span>
        </div>
        <main style={{ flex: 1, padding: '24px', overflowX: 'hidden' }}>{children}</main>
      </div>
    </div>
  );
}
