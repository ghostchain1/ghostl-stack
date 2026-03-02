/**
 * GhostStack Spinner — Neural Teal loading indicator.
 * Uses brand-aligned animation and colors.
 */

interface SpinnerProps {
  size?: number;
  color?: string;
  label?: string;
}

const keyframes = `
@keyframes ghost-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('__ghost-spinner-kf');
  if (!existing) {
    const style = document.createElement('style');
    style.id = '__ghost-spinner-kf';
    style.textContent = keyframes;
    document.head.appendChild(style);
  }
}

export function Spinner({ size = 24, color = '#00F0B5', label = 'Loading…' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation: 'ghost-spin 0.9s linear infinite',
        }}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke={color}
          strokeWidth="2"
          strokeOpacity="0.15"
          strokeLinecap="round"
        />
        <path
          d="M12 3 A9 9 0 0 1 21 12"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
