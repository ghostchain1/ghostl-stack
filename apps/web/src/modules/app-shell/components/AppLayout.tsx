'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { CommandPalette } from './CommandPalette';
import { GlobalSearch } from './GlobalSearch';
import { NetworkSwitcher } from './NetworkSwitcher';
import { NotificationsCenter } from './NotificationsCenter';
import { useSession } from '../../identity-access/session';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/chain', label: 'Chain' },
  { href: '/nodes', label: 'Nodes' },
  { href: '/validators', label: 'Validators' },
  { href: '/explorer/txs', label: 'Explorer' },
  { href: '/observability/alerts', label: 'Alerts' },
  { href: '/observability/logs', label: 'Logs' },
  { href: '/observability/stack', label: 'Stack' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/devops/releases', label: 'DevOps' }
];

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">GhostL Stack</div>
        <nav className="nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={pathname?.startsWith(item.href) ? 'active' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="title">Dashboard</div>
          <GlobalSearch />
          <NetworkSwitcher />
          <CommandPalette />
          <NotificationsCenter />
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
