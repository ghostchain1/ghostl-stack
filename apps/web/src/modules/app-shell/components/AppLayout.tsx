'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { CommandPalette } from './CommandPalette';
import { GlobalSearch } from './GlobalSearch';
import { NetworkSwitcher } from './NetworkSwitcher';
import { NotificationsCenter } from './NotificationsCenter';
import { useSession } from '../../identity-access/session';
import { normalizeRole, resolveMinimumRole, roleOrder } from '../../identity-access/access-policy';
import { useFeatureFlags } from '../services/FeatureFlagsService';
import { useNetwork } from '../services/NetworkContextService';
import { useTheme } from '../services/ThemeService';
import { useRealm } from '../../identity-access/useRealm';
import { REALM_NAV } from '@/lib/realms';
import { resolveApiBase } from '../../../lib/runtime';
import { DataFetchErrorCard } from '../../../components/DataFetchErrorCard';
import { apiRequest, type ApiError } from '../../../lib/api';

type NavItem = { href: string; label: string; flag?: string };

const legacyNavSections: { title: string; items: NavItem[] }[] = [
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
      { href: '/connection-status', label: 'Connection Status' },
      { href: '/observability/alerts', label: 'Alerts', flag: 'observability.alerts' },
      { href: '/observability/gas', label: 'Chain AI' },
      { href: '/observability/logs', label: 'Logs', flag: 'observability.grafana' },
      { href: '/observability/stack', label: 'Stack', flag: 'observability.grafana' }
    ]
  },
  {
    title: 'Protocol Intelligence',
    items: [
      { href: '/protocol/intelligence', label: 'Overview' },
      { href: '/protocol/risk', label: 'Risk' },
      { href: '/protocol/security', label: 'Security' },
      { href: '/protocol/economics', label: 'Economics' },
      { href: '/protocol/simulations', label: 'Simulations' },
      { href: '/protocol/recommendations', label: 'Recommendations' },
      { href: '/protocol/governance', label: 'Governance' }
    ]
  },
  {
    title: 'Protocol',
    items: [
      { href: '/contracts', label: 'Contracts' },
      { href: '/tokenomics', label: 'Tokenomics' },
      { href: '/stocks', label: 'Stocks' },
      { href: '/treasury', label: 'Treasury' },
      { href: '/governance', label: 'Governance' },
      { href: '/nfts', label: 'NFTs' }
    ]
  },
  {
    title: 'Security',
    items: [
      { href: '/compliance', label: 'Compliance' },
      { href: '/kyc', label: 'KYC' },
      { href: '/devops', label: 'DevOps' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/ai', label: 'AI' },
      { href: '/ai/hyperghost', label: 'Hyper Ghost' }
    ]
  },
  {
    title: 'Admin',
    items: [{ href: '/admin/users', label: 'Users' }]
  }
];

const consoleNavSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operator Console',
    items: [
      { href: '/console/overview', label: 'Overview' },
      { href: '/console/users-wallets', label: 'Users & Wallets' },
      { href: '/console/tokens', label: 'Tokens' },
      { href: '/console/contracts', label: 'Contracts' },
      { href: '/console/bridge', label: 'Bridge' },
      { href: '/console/ai', label: 'AI' },
      { href: '/console/chains-nodes', label: 'Chains & Nodes' },
      { href: '/console/validators', label: 'Validators' },
      { href: '/console/treasury', label: 'Treasury' },
      { href: '/console/governance', label: 'Governance' },
      { href: '/console/compliance', label: 'Compliance & KYC' },
      { href: '/console/devops', label: 'DevOps' },
      { href: '/console/integrations', label: 'Integrations' }
    ]
  }
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, error: sessionError } = useSession();
  const { isEnabled } = useFeatureFlags();
  const { current } = useNetwork();
  const { theme, toggleTheme } = useTheme();
  const [logoutError, setLogoutError] = useState<ApiError | null>(null);
  const userRole = normalizeRole(user?.role);
  const isConsole = pathname?.startsWith('/console');
  const realm = useRealm();
  const navSections = isConsole ? consoleNavSections : legacyNavSections;
  const realmNavItems = realm ? REALM_NAV[realm] : null;
  const ribbon = [
    { label: 'Stack', value: 'Operational' },
    { label: 'Bridges', value: 'Monitoring' },
    { label: 'Sequencer', value: 'Finality <2s' },
    { label: 'Guards', value: 'Active' }
  ];
  const userLabel = user?.username || user?.email;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <img src="/ghostchain-logo.svg" alt="GhostChain" height={42} width={160} style={{ maxWidth: '100%', height: 42 }} />
        </div>
        <nav className="nav">
          {realmNavItems && (
            <div className="nav-section">
              <div className="nav-title">My {realm}</div>
              {realmNavItems.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive ? 'active' : ''}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
          {navSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-title">{section.title}</div>
              {section.items.map((item) => {
                const disabled = item.flag ? !isEnabled(item.flag) : false;
                const minimumRole = resolveMinimumRole(item.href, 'GET');
                const roleBlocked = minimumRole ? roleOrder[userRole] < roleOrder[minimumRole] : false;
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
            GhostChain Control Center
            {current && <span className="muted"> — {current.label}</span>}
          </div>
          <div className="topbar-actions">
            <GlobalSearch />
            <NetworkSwitcher />
            {current?.env && <span className="badge">{current.env}</span>}
            <CommandPalette />
            <NotificationsCenter />
            <button className="button secondary" type="button" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
            {user && (
              <div className="inline-form">
                {userLabel && <span className="muted">{userLabel}</span>}
                {realm && <span className="badge">{realm}</span>}
                {user.role && <span className="badge">{user.role}</span>}
                <button
                  className="button secondary"
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await apiRequest('/api/auth/logout', {
                        baseUrl: resolveApiBase(),
                        init: { method: 'POST' }
                      });
                      if (!res.ok) {
                        setLogoutError(res.error);
                        return;
                      }
                      setLogoutError(null);
                      window.location.href = '/login';
                    } catch (err) {
                      setLogoutError({
                        message: err instanceof Error ? err.message : 'logout_failed',
                        endpoint: `${resolveApiBase()}/api/auth/logout`,
                        method: 'POST'
                      });
                    }
                  }}
                >
                  Logout
                </button>
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
        <main>
          {sessionError && (
            <div className="card-grid" style={{ marginBottom: 16 }}>
              <DataFetchErrorCard title="Session" error={sessionError} />
            </div>
          )}
          {logoutError && (
            <div className="card-grid" style={{ marginBottom: 16 }}>
              <DataFetchErrorCard title="Logout" error={logoutError} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
