import type { ReactNode } from 'react';
import type { LayerKey } from './LayerBadge';
import { LayerBadge, LAYER_CONFIG } from './LayerBadge';

interface EcosystemCardProps {
  layer: LayerKey;
  name: string;
  role: string;
  metrics?: Array<{ label: string; value: string }>;
  href?: string;
  status?: 'active' | 'warning' | 'error' | 'inactive';
  children?: ReactNode;
  className?: string;
}

const STATUS_CONFIG = {
  active:   { color: '#00F0B5', label: 'ACTIVE' },
  warning:  { color: '#C9A227', label: 'WARN'   },
  error:    { color: '#FF3B3B', label: 'ERROR'  },
  inactive: { color: '#8A9BB5', label: 'IDLE'   },
};

/**
 * EcosystemCard — Branded card for GhostStack ecosystem components.
 * Layer accent color drives the entire card identity.
 */
export function EcosystemCard({
  layer,
  name,
  role,
  metrics = [],
  href,
  status = 'active',
  children,
  className = '',
}: EcosystemCardProps) {
  const cfg = LAYER_CONFIG[layer];
  const statusCfg = STATUS_CONFIG[status];

  const cardContent = (
    <div
      className={`sovereign-card group relative overflow-hidden ${className}`}
      style={{
        borderColor: `${cfg.color}22`,
        transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = `${cfg.color}55`;
        el.style.boxShadow = `0 8px 32px rgba(0,0,0,0.3), 0 0 24px ${cfg.color}22`;
        el.style.transform = 'translateY(-3px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = `${cfg.color}22`;
        el.style.boxShadow = '';
        el.style.transform = '';
      }}
    >
      {/* Layer accent top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${cfg.color}, transparent)`,
        }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <LayerBadge layer={layer} showDot />
          <span
            style={{
              fontFamily: 'Sora, system-ui, sans-serif',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: cfg.color,
              letterSpacing: '0.02em',
            }}
          >
            {name}
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusCfg.color,
              boxShadow: `0 0 6px ${statusCfg.color}`,
              display: 'inline-block',
              animation: status === 'active' ? 'pulse-glow 2s ease-in-out infinite' : 'none',
            }}
          />
          <span
            className="section-label"
            style={{ color: statusCfg.color, fontSize: '0.6rem' }}
          >
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Role description */}
      <p
        className="section-label mb-4"
        style={{ color: '#8A9BB5', fontSize: '0.7rem' }}
      >
        {role}
      </p>

      {/* Metrics */}
      {metrics.length > 0 && (
        <div
          className="grid gap-2 mb-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 2)}, 1fr)` }}
        >
          {metrics.map((m) => (
            <div
              key={m.label}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            >
              <div className="section-label" style={{ fontSize: '0.6rem', marginBottom: 3 }}>
                {m.label}
              </div>
              <div
                style={{
                  fontFamily: 'Orbitron, system-ui, sans-serif',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#E8EDF5',
                  letterSpacing: '0.04em',
                }}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {children}

      {/* Arrow indicator for linked cards */}
      {href && (
        <div
          className="flex items-center gap-1 mt-2"
          style={{ color: cfg.color, fontSize: '0.72rem', opacity: 0.7 }}
        >
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '0.06em' }}>
            EXPLORE
          </span>
          <span>→</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', display: 'block' }}>
        {cardContent}
      </a>
    );
  }

  return cardContent;
}

interface EcosystemGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

/**
 * EcosystemGrid — Responsive grid container for EcosystemCards.
 */
export function EcosystemGrid({
  children,
  columns = 3,
  className = '',
}: EcosystemGridProps) {
  const colClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className={`grid gap-4 ${colClass} ${className}`}>
      {children}
    </div>
  );
}
