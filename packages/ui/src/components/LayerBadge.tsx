import type { PropsWithChildren } from 'react';

export type LayerKey = 'l1' | 'l2' | 'l3' | 'ai' | 'sec';

interface LayerBadgeProps {
  layer: LayerKey;
  /** Override the display label (defaults to canonical layer name) */
  label?: string;
  className?: string;
}

const LAYER_CONFIG: Record<LayerKey, { label: string; color: string; bg: string; border: string }> = {
  l1:  { label: 'L1 GhostChain', color: '#C9A227', bg: 'rgba(201,162,39,0.12)',  border: 'rgba(201,162,39,0.35)'  },
  l2:  { label: 'L2 GhostL2',    color: '#7A5CFF', bg: 'rgba(122,92,255,0.12)',  border: 'rgba(122,92,255,0.35)'  },
  l3:  { label: 'L3 GhostL3',    color: '#00C2FF', bg: 'rgba(0,194,255,0.12)',   border: 'rgba(0,194,255,0.35)'   },
  ai:  { label: 'AI',            color: '#00F0B5', bg: 'rgba(0,240,181,0.12)',   border: 'rgba(0,240,181,0.35)'   },
  sec: { label: 'Security',      color: '#FF3B3B', bg: 'rgba(255,59,59,0.12)',   border: 'rgba(255,59,59,0.35)'   },
};

/**
 * LayerBadge — renders a GhostStack ecosystem layer identifier pill.
 * Colors are derived from the canonical brand palette.
 *
 * @example
 * <LayerBadge layer="l2" />
 * <LayerBadge layer="ai" label="Hyper Ghost AI" />
 */
export function LayerBadge({ layer, label, className = '' }: LayerBadgeProps) {
  const cfg = LAYER_CONFIG[layer];
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {label ?? cfg.label}
    </span>
  );
}

/**
 * RoutingFlow — renders the sovereign routing law: L3 → L2 → L1
 */
export function RoutingFlow({ className = '' }: { className?: string }) {
  const items: Array<{ key: LayerKey | null; text?: string }> = [
    { key: 'l3' },
    { key: null, text: '→' },
    { key: 'l2' },
    { key: null, text: '→' },
    { key: 'l1' },
  ];

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      {items.map((item, i) =>
        item.key === null ? (
          <span
            key={i}
            style={{
              color: '#8A9BB5',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: '0.75rem',
            }}
          >
            {item.text}
          </span>
        ) : (
          <LayerBadge key={i} layer={item.key} label={item.key.toUpperCase()} />
        ),
      )}
    </div>
  );
}

export function LayerBadgeGroup({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
    >
      {children}
    </div>
  );
}
