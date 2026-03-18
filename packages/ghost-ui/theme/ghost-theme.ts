/**
 * GhostChain Master Brand Theme
 * Single source of truth for all Ghost ecosystem color, glow, and type tokens.
 */

export const ghostColors = {
  ghostGreen:   "#23d6a6",
  ghostGreenBright: "#57f3c4",
  ghostCyan:    "#6bc7ff",
  ghostPurple:  "#8d7cff",
  ghostGold:    "#d6b15f",
  ghostEmber:   "#2f7fb2",
  ghostBlack:   "#06090d",
  ghostSilver:  "#8fa6a0",
  ghostSurface: "#10161c",
  ghostBorder:  "rgba(87,243,196,0.16)",
  ghostPanel:   "rgba(255,255,255,0.03)",
} as const;

export const ghostGlow = {
  gold:   "0 0 16px rgba(35,214,166,0.45)",
  ember:  "0 0 16px rgba(107,199,255,0.35)",
  strong: "0 0 32px rgba(35,214,166,0.7)",
  soft:   "0 0 8px  rgba(35,214,166,0.24)",
} as const;

export const ghostTypography = {
  fontPrimary:   "'Syne', 'Inter', sans-serif",
  fontSecondary: "'Inter', system-ui, sans-serif",
  headingStyle:  "uppercase",
  headingSpacing: "0.08em",
} as const;

export const ghostTheme = {
  colors: ghostColors,
  glow:   ghostGlow,
  typography: ghostTypography,

  /** CSS custom-property block — inject into :root */
  cssVars: `
    --ghost-green:   ${ghostColors.ghostGreen};
    --ghost-green-bright: ${ghostColors.ghostGreenBright};
    --ghost-cyan:    ${ghostColors.ghostCyan};
    --ghost-purple:  ${ghostColors.ghostPurple};
    --ghost-gold:    ${ghostColors.ghostGold};
    --ghost-ember:   ${ghostColors.ghostEmber};
    --ghost-black:   ${ghostColors.ghostBlack};
    --ghost-silver:  ${ghostColors.ghostSilver};
    --ghost-surface: ${ghostColors.ghostSurface};
    --ghost-border:  ${ghostColors.ghostBorder};
    --ghost-panel:   ${ghostColors.ghostPanel};
    --ghost-glow-gold:   ${ghostGlow.gold};
    --ghost-glow-strong: ${ghostGlow.strong};
    --accent:        ${ghostColors.ghostGreen};
    --accent-2:      ${ghostColors.ghostGold};
    --accent-3:      ${ghostColors.ghostCyan};
  `,
} as const;

export default ghostTheme;
