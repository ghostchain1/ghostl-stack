import type { PropsWithChildren, ReactNode } from 'react';

export type AlertTone = 'info' | 'success' | 'warning' | 'critical';

interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  className?: string;
  /** Optional element rendered in the top-right corner */
  action?: ReactNode;
}

const TONE: Record<AlertTone, { bg: string; border: string; color: string; iconColor: string }> = {
  info:     { bg: 'rgba(122,92,255,0.10)',  border: 'rgba(122,92,255,0.30)', color: 'var(--text)', iconColor: '#7A5CFF' },
  success:  { bg: 'rgba(0,240,181,0.10)',   border: 'rgba(0,240,181,0.30)', color: '#00F0B5',     iconColor: '#00F0B5' },
  warning:  { bg: 'rgba(201,162,39,0.10)',  border: 'rgba(201,162,39,0.30)', color: '#C9A227',    iconColor: '#C9A227' },
  critical: { bg: 'rgba(255,59,59,0.10)',   border: 'rgba(255,59,59,0.30)', color: '#FF3B3B',     iconColor: '#FF3B3B' },
};

const ICON: Record<AlertTone, string> = {
  info:     '◈',
  success:  '✓',
  warning:  '⚠',
  critical: '✕',
};

/**
 * Alert — GhostStack brand-aligned notification component.
 *
 * @example
 * <Alert tone="warning" title="Finality Delay">
 *   L2 finality is delayed by 4 slots.
 * </Alert>
 */
export function Alert({ tone = 'info', title, action, className = '', children }: PropsWithChildren<AlertProps>) {
  const cfg = TONE[tone];
  return (
    <div
      className={className}
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 16px',
        borderRadius: 14,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {title && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontWeight: 700,
                fontSize: '0.88rem',
                color: cfg.color,
              }}
            >
              <span style={{ fontSize: '0.95em', color: cfg.iconColor }}>{ICON[tone]}</span>
              {title}
            </div>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      {children && (
        <div
          style={{
            fontSize: '0.85rem',
            color: cfg.color,
            opacity: title ? 0.85 : 1,
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
