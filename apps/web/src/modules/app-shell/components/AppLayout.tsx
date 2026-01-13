'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { CommandPalette } from './CommandPalette';
import { GlobalSearch } from './GlobalSearch';
import { NetworkSwitcher } from './NetworkSwitcher';
import { NotificationsCenter } from './NotificationsCenter';
import { useSession } from '../../identity-access/session';
import { useFeatureFlags } from '../services/FeatureFlagsService';
import { useNetwork } from '../services/NetworkContextService';
import { useTheme } from '../services/ThemeService';

const navItems: { href: string; label: string; flag?: string; roles?: string[] }[] = [
  { href: '/', label: 'Command Hub' },
  { href: '/chain', label: 'Chain' },
  { href: '/nodes', label: 'Nodes' },
  { href: '/validators', label: 'Validators' },
  { href: '/bridge', label: 'Bridge' },
  { href: '/observability/alerts', label: 'Alerts', flag: 'observability.alerts' },
  { href: '/observability/logs', label: 'Logs', flag: 'observability.grafana' },
  { href: '/observability/stack', label: 'Stack', flag: 'observability.grafana' },
  { href: '/wallet', label: 'Wallet', flag: 'wallet.siwe' },
  { href: '/explorer/txs', label: 'Explorer' },
  { href: '/contracts', label: 'Contracts', roles: ['Developer', 'Protocol Admin'] },
  { href: '/tokenomics', label: 'Treasury', roles: ['Treasury Admin', 'Protocol Admin'] },
  { href: '/ai', label: 'AI' },
  { href: '/devops', label: 'DevOps', roles: ['Protocol Admin'] },
  { href: '/governance', label: 'Governance', roles: ['Protocol Admin', 'Developer'] },
  { href: '/integrations', label: 'Integrations', roles: ['Developer'] },
  { href: '/admin/users', label: 'Users', roles: ['Admin', 'Operator', 'Protocol Admin'] }
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const { isEnabled } = useFeatureFlags();
  const { current } = useNetwork();
  const { theme, toggleTheme } = useTheme();
  const userRoles = user?.roles || [];
  const ribbon = [
    { label: 'Stack', value: 'Operational', tone: 'success' },
    { label: 'Bridges', value: 'Monitoring', tone: 'success' },
    { label: 'Sequencer', value: 'Finality <2s', tone: 'success' },
    { label: 'Guards', value: 'Active', tone: 'success' }
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">GhostL Stack</div>
        <nav className="nav">
          {navItems.map((item) => {
            const disabled = item.flag ? !isEnabled(item.flag) : false;
            const roleBlocked =
              item.roles && item.roles.length && userRoles.length ? !item.roles.some((r) => userRoles.includes(r)) : false;
            if (roleBlocked) return null;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${pathname?.startsWith(item.href) ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                aria-disabled={disabled}
                style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : undefined }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="title">
            Control Center
            {current && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>· {current.label}</span>}
          </div>
          <GlobalSearch />
          <NetworkSwitcher />
          <CommandPalette />
          <NotificationsCenter />
          <button className="button secondary" type="button" onClick={toggleTheme} title="Toggle theme" style={{ minWidth: 42 }}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          {user && (
            <div className="inline-form" style={{ gap: 6 }}>
              {user.email && <span className="muted">{user.email}</span>}
              {(user.roles || []).map((r) => (
                <span key={r} className="badge">
                  {r}
                </span>
              ))}
              {(user.permissions || []).includes('guard:write') && <span className="badge">guard:write</span>}
            </div>
          )}
        </header>
        <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {ribbon.map((item) => (
            <div
              key={item.label}
              className="pill"
              style={{
                borderColor: 'var(--border)',
                background: 'rgba(255,255,255,0.04)',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pulse" />
                {item.label}
              </span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}
