import type { CSSProperties, PropsWithChildren, ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Optional accent layer for the top border stripe */
  layer?: 'l1' | 'l2' | 'l3' | 'ai' | 'sec';
}

const LAYER_COLOR: Record<NonNullable<CardProps['layer']>, string> = {
  l1:  '#C9A227',
  l2:  '#7A5CFF',
  l3:  '#00C2FF',
  ai:  '#00F0B5',
  sec: '#FF3B3B',
};

export function Card({ title, subtitle, className = '', layer, style, children }: PropsWithChildren<CardProps>) {
  const borderTop = layer ? `2px solid ${LAYER_COLOR[layer]}` : undefined;
  return (
    <div className={`card ${className}`.trim()} style={{ borderTop, ...style }}>
      {title && (
        <h3 style={{ fontFamily: "'Orbitron', system-ui, sans-serif", margin: '0 0 8px' }}>
          {title}
        </h3>
      )}
      {subtitle && <p className="muted" style={{ margin: '0 0 8px' }}>{subtitle}</p>}
      {children}
    </div>
  );
}
