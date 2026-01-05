import type { PropsWithChildren } from 'react';

interface BadgeProps {
  tone?: 'default' | 'success' | 'warning' | 'critical';
  className?: string;
}

const toneColor: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'var(--border)',
  success: '#22c55e33',
  warning: '#fbbf2433',
  critical: '#ef444433'
};

export function Badge({ children, tone = 'default', className = '' }: PropsWithChildren<BadgeProps>) {
  const style = { background: toneColor[tone] } as const;
  return (
    <span className={`badge ${className}`.trim()} style={style}>
      {children}
    </span>
  );
}
