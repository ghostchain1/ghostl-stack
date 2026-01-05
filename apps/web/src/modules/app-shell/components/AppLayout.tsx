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

const navItems: { href: string; label: string; flag?: string }[] = [
  { href: '/', label: 'Overview' },
  { href: '/chain', label: 'Chain' },
  { href: '/nodes', label: 'Nodes' },
  { href: '/validators', label: 'Validators' },
  { href: '/explorer/txs', label: 'Explorer' },
  { href: '/observability/alerts', label: 'Alerts', flag: 'observability.alerts' },
  { href: '/observability/logs', label: 'Logs', flag: 'observability.grafana' },
  { href: '/observability/stack', label: 'Stack', flag: 'observability.grafana' },
  { href: '/wallet', label: 'Wallet', flag: 'wallet.siwe' },
  { href: '/devops/releases', label: 'DevOps' }
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const { isEnabled } = useFeatureFlags();
  const { current } = useNetwork();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">GhostL Stack</div>
        <nav className="nav">
          {navItems.map((item) => {
            const disabled = item.flag ? !isEnabled(item.flag) : false;
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
            Dashboard
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
        <main>{children}</main>
      </div>
    </div>
  );
}
