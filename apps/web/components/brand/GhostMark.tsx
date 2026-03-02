import { useId, type SVGProps } from 'react';

interface GhostMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
  glowColor?: string;
  variant?: 'full' | 'mark-only' | 'wordmark-only';
}

/**
 * GhostStack Ghost Mark — Geometric ghost silhouette in hexagonal frame.
 * Official brand mark. Do not modify proportions.
 */
export function GhostMark({
  size = 32,
  glowColor = '#7A5CFF',
  variant: _variant = 'mark-only',
  className = '',
  ...props
}: GhostMarkProps) {
  const uid = useId();
  const glowId = `ghost-glow-${uid.replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="GhostStack mark"
      {...props}
    >
      <defs>
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="ghost-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={glowColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Hexagonal frame */}
      <polygon
        points="24,2 43,13 43,35 24,46 5,35 5,13"
        stroke={glowColor}
        strokeWidth="1.2"
        strokeOpacity="0.4"
        fill="none"
      />

      {/* Ghost body */}
      <path
        d="M24 10 C17 10 13 15 13 21 L13 34 L16 31 L19 34 L22 31 L25 34 L28 31 L31 34 L35 34 L35 21 C35 15 31 10 24 10 Z"
        fill="url(#ghost-body-grad)"
        filter={`url(#${glowId})`}
      />

      {/* Ghost eyes */}
      <circle cx="20" cy="21" r="2" fill="#0B0F14" />
      <circle cx="28" cy="21" r="2" fill="#0B0F14" />

      {/* Neural line overlays */}
      <line x1="13" y1="21" x2="5"  y2="18" stroke={glowColor} strokeWidth="0.6" strokeOpacity="0.35" />
      <line x1="35" y1="21" x2="43" y2="18" stroke={glowColor} strokeWidth="0.6" strokeOpacity="0.35" />
      <line x1="24" y1="10" x2="24" y2="2"  stroke={glowColor} strokeWidth="0.6" strokeOpacity="0.35" />
    </svg>
  );
}

/**
 * GhostStack full wordmark lockup: mark + GHOSTSTACK text.
 */
export function GhostWordmark({
  size = 32,
  glowColor = '#7A5CFF',
  showTagline = false,
  className = '',
}: {
  size?: number;
  glowColor?: string;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <GhostMark size={size} glowColor={glowColor} />
      <div className="flex flex-col leading-none">
        <span
          className="font-display font-bold tracking-sovereign text-ghost-white uppercase"
          style={{
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: size * 0.45,
            letterSpacing: '0.12em',
            color: '#E8EDF5',
          }}
        >
          GHOSTSTACK
        </span>
        {showTagline && (
          <span
            className="font-body text-phantom-mist"
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: size * 0.22,
              letterSpacing: '0.06em',
              color: '#8A9BB5',
              marginTop: 2,
            }}
          >
            Autonomy Secured.
          </span>
        )}
      </div>
    </div>
  );
}
