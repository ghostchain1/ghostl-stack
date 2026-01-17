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

type NavItem = { href: string; label: string; flag?: string; roles?: string[] };

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Command',
    items: [
      { href: '/', label: 'Command Hub' },
      { href: '/chain', label: 'Chain' },
      { href: '/nodes', label: 'Nodes' },
      { href: '/validators', label: 'Validators' }
    ]
  },
  {
    title: 'Operations',
    items: [
      { href: '/bridge', label: 'Bridge' },
      { href: '/wallet', label: 'Wallet' },
      { href: '/explorer/txs', label: 'Explorer' }
    ]
  },
  {
    title: 'Observability',
    items: [
      { href: '/observability', label: 'Overview' },
      { href: '/observability/alerts', label: 'Alerts', flag: 'observability.alerts' },
      { href: '/observability/logs', label: 'Logs', flag: 'observability.grafana' },
      { href: '/observability/stack', label: 'Stack', flag: 'observability.grafana' }
    ]
  },
  {
    title: 'Protocol',
    items: [
      { href: '/contracts', label: 'Contracts', roles: ['Developer', 'Protocol Admin'] },
      { href: '/tokenomics', label: 'Tokenomics', roles: ['Treasury Admin', 'Protocol Admin'] },
      { href: '/treasury', label: 'Treasury', roles: ['Treasury Admin', 'Protocol Admin'] },
      { href: '/governance', label: 'Governance', roles: ['Protocol Admin', 'Developer'] }
    ]
  },
  {
    title: 'Security',
    items: [
      { href: '/compliance', label: 'Compliance', roles: ['Admin', 'Operator', 'Protocol Admin'] },
      { href: '/devops', label: 'DevOps', roles: ['Protocol Admin'] },
      { href: '/integrations', label: 'Integrations', roles: ['Developer'] },
      { href: '/ai', label: 'AI' }
    ]
  },
  {
    title: 'Admin',
    items: [{ href: '/admin/users', label: 'Users', roles: ['Admin', 'Operator', 'Protocol Admin'] }]
  }
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const { isEnabled } = useFeatureFlags();
  const { current } = useNetwork();
  const { theme, toggleTheme } = useTheme();
  const userRoles = user?.roles || [];
  const ribbon = [
    { label: 'Stack', value: 'Operational' },
    { label: 'Bridges', value: 'Monitoring' },
    { label: 'Sequencer', value: 'Finality <2s' },
    { label: 'Guards', value: 'Active' }
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">GhostL Stack</div>
        <nav className="nav">
          {navSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-title">{section.title}</div>
              {section.items.map((item) => {
                const disabled = item.flag ? !isEnabled(item.flag) : false;
                const roleBlocked =
                  item.roles && item.roles.length && userRoles.length ? !item.roles.some((r) => userRoles.includes(r)) : false;
                if (roleBlocked) return null;
                const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                    aria-disabled={disabled}
                    style={{ pointerEvents: disabled ? 'none' : undefined }}
                  >
                    <span>{item.label}</span>
                    {disabled && <span className="chip">Disabled</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted">Active network</div>
          <div className="spread">
            <strong>{current?.label || 'GhostL2'}</strong>
            <span className="chip">{current?.env || 'local'}</span>
          </div>
          <div className="muted">{current?.rpc || 'RPC unassigned'}</div>
          {current?.chainId && <div className="muted">Chain ID {current.chainId}</div>}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="title">
            Control Center
            {current && <span className="muted"> - {current.label}</span>}
          </div>
          <div className="topbar-actions">
            <GlobalSearch />
            <NetworkSwitcher />
            <CommandPalette />
            <NotificationsCenter />
            <button className="button secondary" type="button" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
            {user && (
              <div className="inline-form">
                {user.email && <span className="muted">{user.email}</span>}
                {(user.roles || []).map((r) => (
                  <span key={r} className="badge">
                    {r}
                  </span>
                ))}
                {(user.permissions || []).includes('guard:write') && <span className="badge">guard:write</span>}
              </div>
            )}
          </div>
        </header>
        <div className="status-strip">
          {ribbon.map((item) => (
            <div key={item.label} className="status-chip">
              <span className="inline-form">
                <span className="pulse" />
                {item.label}
              </span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}
