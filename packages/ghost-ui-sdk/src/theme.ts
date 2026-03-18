/**
 * Canonical GhostChain shared theme.
 *
 * This is the package-level source of truth for the sovereign
 * dark/graphite + Ghost green visual system. Keep it aligned with
 * /branding/tokens.css so apps can consume either CSS variables or
 * typed tokens without drifting apart.
 */

export const ghostColors = {
  ghostGreen: "#23d6a6",
  ghostGreenBright: "#57f3c4",
  ghostGreenDark: "#159173",
  ghostCyan: "#6bc7ff",
  ghostCyanDark: "#2f7fb2",
  ghostPurple: "#8d7cff",
  ghostGold: "#d6b15f",
  ghostBlack: "#06090d",
  ghostGraphite: "#10161c",
  ghostSurface: "#161e26",
  ghostSurfaceRaised: "#1d2831",
  ghostBorder: "rgba(87, 243, 196, 0.16)",
  ghostBorderStrong: "rgba(87, 243, 196, 0.28)",
  ghostText: "#ebf6f2",
  ghostMuted: "#8fa6a0",
} as const;

export const ghostGlow = {
  primary: "0 0 18px rgba(35, 214, 166, 0.35)",
  cyan: "0 0 18px rgba(107, 199, 255, 0.28)",
  strong: "0 0 28px rgba(35, 214, 166, 0.48)",
  soft: "0 0 8px rgba(35, 214, 166, 0.22)",
} as const;

export const ghostStatus = {
  healthy: ghostColors.ghostGreen,
  degraded: ghostColors.ghostGold,
  critical: "#ff6b6b",
  simulation: ghostColors.ghostPurple,
  governanceRequired: ghostColors.ghostGold,
} as const;

export const ghostTypography = {
  fontDisplay: '"Syne", "Inter", system-ui, sans-serif',
  fontBody: '"Inter", system-ui, sans-serif',
  fontMono: '"JetBrains Mono", "Fira Code", monospace',
  headingStyle: "uppercase",
  headingSpacing: "0.08em",
} as const;

export const ghostTheme = {
  colors: ghostColors,
  glow: ghostGlow,
  status: ghostStatus,
  typography: ghostTypography,
  cssVars: `
    --ghost-green: ${ghostColors.ghostGreen};
    --ghost-green-bright: ${ghostColors.ghostGreenBright};
    --ghost-green-dark: ${ghostColors.ghostGreenDark};
    --ghost-cyan: ${ghostColors.ghostCyan};
    --ghost-cyan-dark: ${ghostColors.ghostCyanDark};
    --ghost-purple: ${ghostColors.ghostPurple};
    --ghost-gold: ${ghostColors.ghostGold};
    --ghost-bg: ${ghostColors.ghostBlack};
    --ghost-surface: ${ghostColors.ghostGraphite};
    --ghost-surface-2: ${ghostColors.ghostSurface};
    --ghost-surface-3: ${ghostColors.ghostSurfaceRaised};
    --ghost-border: ${ghostColors.ghostBorder};
    --ghost-border-strong: ${ghostColors.ghostBorderStrong};
    --ghost-text: ${ghostColors.ghostText};
    --ghost-muted: ${ghostColors.ghostMuted};
    --ghost-success: ${ghostStatus.healthy};
    --ghost-warning: ${ghostStatus.degraded};
    --ghost-error: ${ghostStatus.critical};
    --ghost-simulation: ${ghostStatus.simulation};
    --ghost-governance: ${ghostStatus.governanceRequired};
    --accent: ${ghostColors.ghostGreen};
    --accent-2: ${ghostColors.ghostGold};
    --accent-3: ${ghostColors.ghostCyan};
    --green: ${ghostStatus.healthy};
    --yellow: ${ghostStatus.degraded};
    --red: ${ghostStatus.critical};
  `,
} as const;

export default ghostTheme;
