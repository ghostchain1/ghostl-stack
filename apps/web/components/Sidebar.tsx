'use client';

/**
 * components/Sidebar.tsx — Standalone GhostChain brand sidebar.
 *
 * Drop-in sidebar independent of AppLayout; useful in custom layouts or
 * embedded dashboards.  Mirrors the full primary nav from AppLayout but can
 * be used in isolation.
 *
 * Usage:
 *   <Sidebar collapsed={false} onToggle={() => setCollapsed(v => !v)} />
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';
import { useRealtime } from '../lib/ws';

// ── Nav definition ─────────────────────────────────────────────────────────

type NavItem = { href: string; label: string; icon?: string };
type NavSection = { title: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    title: 'Dashboard',
    items: [
      { href: '/overview',  label: 'Overview',  icon: '◈' },
      { href: '/monitor',   label: 'Monitor',   icon: '⬡' },
      { href: '/alerts',    label: 'Alerts',    icon: '⚡' },
      { href: '/logs',      label: 'Logs',      icon: '≡' },
    ],
  },
  {
    title: 'Chain',
    items: [
      { href: '/chain',      label: 'Chain',       icon: '⛓' },
      { href: '/chains/l1',  label: '↳ L1',        icon: '' },
      { href: '/chains/l2',  label: '↳ L2',        icon: '' },
      { href: '/chains/l3',  label: '↳ L3',        icon: '' },
      { href: '/nodes',      label: 'Nodes',       icon: '◉' },
      { href: '/validators', label: 'Validators',  icon: '✓' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/bridge',     label: 'Bridge',      icon: '↔' },
      { href: '/wallet',     label: 'Wallet',      icon: '◎' },
      { href: '/explorer',   label: 'Explorer',    icon: '⌕' },
      { href: '/treasury',   label: 'Treasury',    icon: '◆' },
    ],
  },
  {
    title: 'Protocol',
    items: [
      { href: '/governance', label: 'Governance',  icon: '⚖' },
      { href: '/contracts',  label: 'Contracts',   icon: '📄' },
      { href: '/tokenomics', label: 'Tokenomics',  icon: '◈' },
    ],
  },
  {
    title: 'AI & Security',
    items: [
      { href: '/ai',         label: 'AI Engine',   icon: '🧠' },
      { href: '/compliance', label: 'Compliance',  icon: '⚑' },
      { href: '/devops',     label: 'DevOps',      icon: '⚙' },
    ],
  },
  {
    title: 'Portal',
    items: [
      { href: '/portal/dashboard', label: '⬡ Control Portal', icon: '' },
      { href: '/settings',         label: 'Settings',          icon: '⚙' },
    ],
  },
];

// ── Component ───────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function Sidebar({ collapsed = false, onToggle, className = '' }: SidebarProps) {
  const pathname = usePathname();
  const { connected, ai } = useRealtime();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  return (
    <aside
      data-collapsed={collapsed}
      className={`sidebar ghost-sidebar ${className}`}
      style={{ width: collapsed ? 60 : 240, transition: 'width 0.22s ease' }}
    >
      {/* Logo */}
      <div className="logo" style={{ padding: collapsed ? '16px 10px' : '16px 20px', overflow: 'hidden' }}>
        {collapsed ? (
          <span style={{ fontSize: 22, color: 'var(--accent)' }}>⬡</span>
        ) : (
          <Image
            src="/ghostchain-logo.svg"
            alt="GhostChain"
            width={140}
            height={36}
            priority
            style={{ height: 36, width: 'auto' }}
          />
        )}
      </div>

      {/* Network status pill */}
      {!collapsed && (
        <div style={{
          margin: '0 12px 10px',
          padding: '6px 12px',
          background: connected
            ? 'rgba(35, 214, 166, 0.08)'
            : 'rgba(255, 107, 107, 0.08)',
          border: `1px solid ${connected ? 'rgba(35,214,166,0.2)' : 'rgba(255,107,107,0.2)'}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.76rem',
          color: 'var(--muted)',
        }}>
          <span className={`status-dot ${connected ? 'status-dot--live' : 'status-dot--danger'}`} />
          <span>{connected ? 'LitVyb Live' : 'Connecting…'}</span>
          {ai && (
            <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>
              {ai.alertLevel === 'critical' ? '⚡' : ai.alertLevel === 'elevated' ? '⚠' : '●'}
            </span>
          )}
        </div>
      )}

      {/* Nav sections */}
      <nav className="nav" style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
        {NAV.map((section) => (
          <div key={section.title} className="nav-section">
            {!collapsed && (
              <div className="nav-title" style={{ padding: '10px 8px 4px', fontSize: '0.68rem' }}>
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'active' : ''}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: collapsed ? '8px 12px' : '7px 10px',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    background: active ? 'rgba(35,214,166,0.08)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'background 0.15s, color 0.15s',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {item.icon && (
                    <span style={{ fontSize: 15, flexShrink: 0, opacity: active ? 1 : 0.6 }}>
                      {item.icon}
                    </span>
                  )}
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: '100%',
            padding: '12px',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-end',
            paddingRight: collapsed ? undefined : 20,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      )}
    </aside>
  );
}
