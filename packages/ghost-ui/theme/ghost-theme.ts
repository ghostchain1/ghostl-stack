/**
 * GhostChain Master Brand Theme
 * Single source of truth for all Ghost ecosystem color, glow, and type tokens.
 */

export const ghostColors = {
  ghostGold:    "#FFD700",
  ghostEmber:   "#FFAA00",
  ghostBlack:   "#0A0A0A",
  ghostSilver:  "#C0C0C0",
  ghostSurface: "#0f0f0f",
  ghostBorder:  "rgba(255,215,0,0.18)",
  ghostPanel:   "rgba(255,255,255,0.03)",
} as const;

export const ghostGlow = {
  gold:   "0 0 16px rgba(255,215,0,0.55)",
  ember:  "0 0 16px rgba(255,170,0,0.45)",
  strong: "0 0 32px rgba(255,215,0,0.9)",
  soft:   "0 0 8px  rgba(255,215,0,0.3)",
} as const;

export const ghostTypography = {
  fontPrimary:   "'Orbitron', 'Inter', sans-serif",
  fontSecondary: "'Inter', system-ui, sans-serif",
  headingStyle:  "uppercase",
  headingSpacing: "0.12em",
} as const;

export const ghostTheme = {
  colors: ghostColors,
  glow:   ghostGlow,
  typography: ghostTypography,

  /** CSS custom-property block — inject into :root */
  cssVars: `
    --ghost-gold:    ${ghostColors.ghostGold};
    --ghost-ember:   ${ghostColors.ghostEmber};
    --ghost-black:   ${ghostColors.ghostBlack};
    --ghost-silver:  ${ghostColors.ghostSilver};
    --ghost-surface: ${ghostColors.ghostSurface};
    --ghost-border:  ${ghostColors.ghostBorder};
    --ghost-panel:   ${ghostColors.ghostPanel};
    --ghost-glow-gold:   ${ghostGlow.gold};
    --ghost-glow-strong: ${ghostGlow.strong};
  `,
} as const;

export default ghostTheme;
