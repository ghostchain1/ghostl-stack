interface GhostLogoProps {
  size?: number;
  className?: string;
}

export function GhostLogo({ size = 32, className = "" }: GhostLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="GhostChain"
    >
      <circle cx="24" cy="24" r="22" fill="#1e1b4b" stroke="#7c3aed" strokeWidth="2" />
      <path
        d="M14 30V20a10 10 0 0 1 20 0v10l-3-3-3 3-4-4-4 4-3-3-3 3z"
        fill="#7c3aed"
        opacity=".9"
      />
      <circle cx="19" cy="20" r="1.5" fill="white" />
      <circle cx="29" cy="20" r="1.5" fill="white" />
    </svg>
  );
}
