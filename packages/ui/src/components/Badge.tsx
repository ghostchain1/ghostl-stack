import type { PropsWithChildren } from 'react';

interface BadgeProps {
  tone?: 'default' | 'success' | 'warning' | 'critical';
  className?: string;
}

// Brand-aligned tone palette — matches GhostStack color system
// success → Neural Teal  #00F0B5
// warning → Sovereign Gold #C9A227
// critical → Signal Red  #FF3B3B
const toneColor: Record<NonNullable<BadgeProps['tone']>, string> = {
  default:  'rgba(122, 92, 255, 0.15)',   // Spectral Purple (brand border)
  success:  'rgba(0, 240, 181, 0.20)',    // Neural Teal
  warning:  'rgba(201, 162, 39, 0.20)',   // Sovereign Gold
  critical: 'rgba(255, 59, 59, 0.20)',    // Signal Red
};

const toneTextColor: Record<NonNullable<BadgeProps['tone']>, string> = {
  default:  '#8A9BB5',   // Phantom Mist
  success:  '#00F0B5',   // Neural Teal
  warning:  '#C9A227',   // Sovereign Gold
  critical: '#FF3B3B',   // Signal Red
};

export function Badge({ children, tone = 'default', className = '' }: PropsWithChildren<BadgeProps>) {
  const style = {
    background: toneColor[tone],
    color: toneTextColor[tone],
    border: `1px solid ${toneColor[tone].replace('0.20)', '0.40)').replace('0.15)', '0.30)')}`,
  } as const;
  return (
    <span className={`badge ${className}`.trim()} style={style}>
      {children}
    </span>
  );
}
