import type { ReactNode } from 'react';

export type LayerKey = 'L1' | 'L2' | 'L3' | 'AI' | 'SEC';

interface LayerConfig {
  label: string;
  name: string;
  cssClass: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

const LAYER_CONFIG: Record<LayerKey, LayerConfig> = {
  L1: {
    label: 'L1',
    name: 'GhostChain',
    cssClass: 'layer-badge-l1',
    color: '#C9A227',
    bgColor: 'rgba(201,162,39,0.12)',
    borderColor: 'rgba(201,162,39,0.35)',
    description: 'Sovereign Settlement & Treasury',
  },
  L2: {
    label: 'L2',
    name: 'GhostL2',
    cssClass: 'layer-badge-l2',
    color: '#7A5CFF',
    bgColor: 'rgba(122,92,255,0.12)',
    borderColor: 'rgba(122,92,255,0.35)',
    description: 'Liquidity & Exchange Layer',
  },
  L3: {
    label: 'L3',
    name: 'GhostL3',
    cssClass: 'layer-badge-l3',
    color: '#00C2FF',
    bgColor: 'rgba(0,194,255,0.12)',
    borderColor: 'rgba(0,194,255,0.35)',
    description: 'Utility & Application Layer',
  },
  AI: {
    label: 'AI',
    name: 'Hyper Ghost AI',
    cssClass: 'layer-badge-ai',
    color: '#00F0B5',
    bgColor: 'rgba(0,240,181,0.12)',
    borderColor: 'rgba(0,240,181,0.35)',
    description: 'Autonomous Governance',
  },
  SEC: {
    label: 'SEC',
    name: 'GhostSentinel',
    cssClass: 'layer-badge-sec',
    color: '#FF3B3B',
    bgColor: 'rgba(255,59,59,0.12)',
    borderColor: 'rgba(255,59,59,0.35)',
    description: 'AI Threat Detection',
  },
};

interface LayerBadgeProps {
  layer: LayerKey;
  showName?: boolean;
  showDot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * LayerBadge — Official GhostStack layer identifier chip.
 * Each layer has exactly one accent color. Never mix.
 */
export function LayerBadge({
  layer,
  showName = false,
  showDot = true,
  size = 'sm',
  className = '',
}: LayerBadgeProps) {
  const cfg = LAYER_CONFIG[layer];
  const fontSize = size === 'sm' ? '0.65rem' : '0.75rem';
  const padding = size === 'sm' ? '2px 8px' : '4px 12px';

  return (
    <span
      className={`layer-badge ${cfg.cssClass} ${className}`}
      style={{ fontSize, padding }}
      title={`${cfg.name} — ${cfg.description}`}
    >
      {showDot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: cfg.color,
            boxShadow: `0 0 5px ${cfg.color}`,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      {showName ? `${cfg.label} ${cfg.name}` : cfg.label}
    </span>
  );
}

interface LayerStatusRowProps {
  layers?: LayerKey[];
  className?: string;
}

/**
 * LayerStatusRow — Horizontal row of layer status badges.
 * Used in headers and dashboards.
 */
export function LayerStatusRow({
  layers = ['L1', 'L2', 'L3', 'AI'],
  className = '',
}: LayerStatusRowProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {layers.map((layer) => (
        <LayerBadge key={layer} layer={layer} showDot showName={false} />
      ))}
    </div>
  );
}

interface LayerCardHeaderProps {
  layer: LayerKey;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * LayerCardHeader — Branded card header with layer accent.
 */
export function LayerCardHeader({
  layer,
  title,
  subtitle,
  children,
  className = '',
}: LayerCardHeaderProps) {
  const cfg = LAYER_CONFIG[layer];

  return (
    <div
      className={`rounded-md p-4 ${className}`}
      style={{
        background: cfg.bgColor,
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: '10px 10px 0 0',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayerBadge layer={layer} showDot />
          {title && (
            <span
              className="font-heading font-semibold"
              style={{
                fontFamily: 'Sora, system-ui, sans-serif',
                fontSize: '0.9rem',
                color: cfg.color,
              }}
            >
              {title}
            </span>
          )}
        </div>
        {children}
      </div>
      {subtitle && (
        <p
          className="mt-1 section-label"
          style={{ color: cfg.color, opacity: 0.7 }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

export { LAYER_CONFIG };
