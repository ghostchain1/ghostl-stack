import type { PropsWithChildren } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
  lines?: number;
}

/** Single skeleton pulse block */
export function Skeleton({
  width = '100%',
  height = '1rem',
  radius = '6px',
  className = '',
}: SkeletonProps) {
  return (
    <span
      className={`ghost-skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius, display: 'block' }}
      aria-hidden="true"
    />
  );
}

/** Multi-line text skeleton */
export function SkeletonText({
  lines = 3,
  className = '',
}: Pick<SkeletonProps, 'lines' | 'className'>) {
  const widths = ['100%', '88%', '72%', '94%', '60%'];
  return (
    <div className={`ghost-skeleton-text ${className}`.trim()}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height="0.9rem" />
      ))}
    </div>
  );
}

/** Card-shaped skeleton */
export function SkeletonCard({ className = '' }: Pick<SkeletonProps, 'className'>) {
  return (
    <div className={`card ghost-skeleton-card ${className}`.trim()}>
      <Skeleton height="1.1rem" width="55%" radius="8px" />
      <div style={{ marginTop: 10 }}>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

/** Spinner for async states */
export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`ghost-spinner ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
      role="status"
    >
      <circle
        cx="12" cy="12" r="9"
        stroke="var(--border)"
        strokeWidth="2.5"
      />
      <path
        d="M12 3 A9 9 0 0 1 21 12"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Full-page loading overlay */
export function LoadingOverlay({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="ghost-loading-overlay" role="status" aria-live="polite">
      <Spinner size={40} />
      <p className="muted">{label}</p>
    </div>
  );
}

/** Stat card for dashboards */
interface StatCardProps extends PropsWithChildren {
  label: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  deltaPositive,
  className = '',
}: StatCardProps) {
  return (
    <div className={`card stat-card ${className}`.trim()}>
      <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {delta != null && (
        <div className={`stat-delta ${deltaPositive ? 'positive' : 'negative'}`}>
          {deltaPositive ? '▲' : '▼'} {delta}
        </div>
      )}
    </div>
  );
}
