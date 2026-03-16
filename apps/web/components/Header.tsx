'use client';

/**
 * components/Header.tsx — Standalone GhostChain dashboard header.
 *
 * Shows: breadcrumb, live block ticker, network badge, and user info.
 * Can be used independently of AppLayout for custom page layouts.
 *
 * Usage:
 *   <Header title="Overview" subtitle="Live blockchain telemetry" />
 */

import { usePathname } from 'next/navigation';
import { useRealtime } from '../lib/ws';
import { useChainStore } from '../store/useStore';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

const CHAIN_IDS: Record<string, { label: string; color: string }> = {
  l1:  { label: 'L1 · 14000101', color: 'var(--accent)' },
  l2:  { label: 'L2 · 901',      color: 'var(--accent-3)' },
  l3:  { label: 'L3 · 903',      color: 'var(--accent-2)' },
};

function formatBlock(n: number | undefined) {
  if (n === undefined) return '—';
  return `#${n.toLocaleString()}`;
}

export function Header({ title, subtitle, actions, className = '' }: HeaderProps) {
  const pathname = usePathname();
  const { connected, blockByChain, serverTime } = useRealtime();
  const { status } = useChainStore();

  // Build breadcrumb from pathname
  const crumbs = (pathname ?? '/')
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

  const pageTitle = title ?? crumbs.at(-1) ?? 'GhostStack';

  return (
    <header
      className={`ghost-brand-strip ${className}`}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        flexDirection: 'column',
        gap: 0,
        padding: 0,
      }}
    >
      {/* Top row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        {/* Breadcrumb */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--muted)' }}>
          <span style={{ color: 'var(--accent)', fontSize: 18 }}>⬡</span>
          <span>GhostStack</span>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ opacity: 0.4 }}>/</span>
              <span style={{ color: i === crumbs.length - 1 ? 'var(--text)' : 'var(--muted)', fontWeight: i === crumbs.length - 1 ? 600 : 400 }}>
                {c}
              </span>
            </span>
          ))}
        </div>

        {/* Block ticker — L1/L2/L3 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {Object.entries(CHAIN_IDS).map(([key, meta]) => {
            const block = blockByChain[key];
            return (
              <div key={key} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                fontSize: '0.7rem', lineHeight: 1.3,
              }}>
                <span style={{ color: meta.color, fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '0.82rem' }}>
                  {formatBlock(block)}
                </span>
                <span style={{ color: 'var(--muted)' }}>{meta.label}</span>
              </div>
            );
          })}
        </div>

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
          <span className={`status-dot ${connected ? 'status-dot--live' : 'status-dot--danger'}`} />
          <span style={{ color: connected ? 'var(--accent)' : 'var(--danger)', fontWeight: 600 }}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Actions slot */}
        {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
      </div>

      {/* Page title row */}
      {(title || subtitle) && (
        <div style={{
          padding: '12px 24px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.4rem',
            fontWeight: 800,
            fontFamily: 'var(--font-display)',
            color: 'var(--text)',
          }}>
            {pageTitle}
          </h1>
          {subtitle && (
            <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{subtitle}</span>
          )}
          {serverTime && (
            <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '0.76rem', fontFamily: 'var(--font-display)' }}>
              {new Date(serverTime).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
