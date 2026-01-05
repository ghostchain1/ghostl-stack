import type { PropsWithChildren, ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, className = '', children }: PropsWithChildren<CardProps>) {
  return (
    <div className={`card ${className}`.trim()}>
      {title && <h3>{title}</h3>}
      {subtitle && <p className="muted">{subtitle}</p>}
      {children}
    </div>
  );
}
