/**
 * @ghostchain/brand
 *
 * Compile-time GhostChain brand constants — the single source of truth for
 * design tokens, palette values, chain identifiers, and brand metadata.
 *
 * These objects are Object.freeze()d so they cannot be mutated at runtime.
 * Mirror of the design tokens served by the theme-service at runtime.
 *
 * Usage:
 *   import { GHOST_BRAND, GHOST_PALETTE, GHOST_THEMES } from "@ghostchain/brand";
 */

// ── Brand identity ─────────────────────────────────────────────────────────────

export const GHOST_BRAND = Object.freeze({
  name:            "GhostChain",
  token:           "Ghost",
  symbol:          "GST",
  decimals:        18,
  tagline:         "Sovereign L1 · L2 · L3",
  description:     "GhostChain — a sovereign, multi-layer blockchain with autonomous AI governance.",
  homepage:        "https://ghostchain.io",
  application:     "GhostChain Control Center",
  /** Chain IDs for all supported layers. */
  chainIds: Object.freeze({
    L1: 14_000_101,
    L2: 901,
    L3: 903,
  }),
  /** Well-known service ports (default local dev). */
  ports: Object.freeze({
    ghostbrainCore:    7900,
    hyperGhostAi:      7741,
    ghostbrainGsa:     7850,
    treasuryAi:        7630,
    governanceService: 7645,
    themeService:      7634,
    ghostHealthAgg:    7640,
  }),
});

// ── Colour palette ─────────────────────────────────────────────────────────────

/** Raw hex values — prefer semantic tokens for UI work. */
export const GHOST_PALETTE = Object.freeze({
  ghost: Object.freeze({
    50:  "#e8fdf7",
    100: "#c6faee",
    200: "#91f5df",
    300: "#4debcc",
    400: "#23d6a6",   // PRIMARY ACCENT — Ghost Green
    500: "#17b38a",
    600: "#0e9170",
    700: "#0b735a",
    800: "#095b47",
    900: "#074a3a",
    950: "#042e24",
  }),
  gold: Object.freeze({
    50:  "#fefce8",
    100: "#fef9c3",
    200: "#fef08a",
    300: "#fde047",
    400: "#f2c14e",   // SECONDARY ACCENT — Ghost Gold
    500: "#eab308",
    600: "#ca8a04",
    700: "#a16207",
    800: "#854d0e",
    900: "#713f12",
    950: "#422006",
  }),
  blue: Object.freeze({
    50:  "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#7aa2ff",   // TERTIARY ACCENT — Ghost Blue
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  }),
  neutral: Object.freeze({
    0:   "#ffffff",
    50:  "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    850: "#141f30",
    900: "#0f172a",
    950: "#080e1a",
    1000:"#020408",
  }),
});

// ── Semantic colour aliases ────────────────────────────────────────────────────

export const GHOST_SEMANTIC = Object.freeze({
  /** Page / canvas backgrounds */
  bg:        Object.freeze({ primary: GHOST_PALETTE.neutral[950], secondary: GHOST_PALETTE.neutral[900], tertiary: GHOST_PALETTE.neutral[850] }),
  /** Surface cards, panels */
  surface:   Object.freeze({ default: GHOST_PALETTE.neutral[900], raised: GHOST_PALETTE.neutral[850], overlay: GHOST_PALETTE.neutral[800] }),
  /** Brand accents */
  accent:    Object.freeze({ primary: GHOST_PALETTE.ghost[400], secondary: GHOST_PALETTE.gold[400], tertiary: GHOST_PALETTE.blue[400] }),
  /** Text hierarchy */
  text:      Object.freeze({ primary: GHOST_PALETTE.neutral[50], secondary: GHOST_PALETTE.neutral[300], muted: GHOST_PALETTE.neutral[500] }),
  /** Severity coding */
  status:    Object.freeze({
    success: GHOST_PALETTE.ghost[400],
    warning: GHOST_PALETTE.gold[400],
    danger:  "#f87171",  // red-400
    info:    GHOST_PALETTE.blue[400],
  }),
  /** Border colours */
  border:    Object.freeze({ subtle: GHOST_PALETTE.neutral[800], default: GHOST_PALETTE.neutral[700], strong: GHOST_PALETTE.neutral[600] }),
});

// ── Typography ─────────────────────────────────────────────────────────────────

export const GHOST_TYPOGRAPHY = Object.freeze({
  fonts: Object.freeze({
    sans:  ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
    display:["Sora", "Space Grotesk", "ui-sans-serif", "sans-serif"],
    mono:  ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
  }),
  /** Named type scale in rem */
  scale: Object.freeze({
    xs:   "0.75rem",
    sm:   "0.875rem",
    base: "1rem",
    lg:   "1.125rem",
    xl:   "1.25rem",
    "2xl":"1.5rem",
    "3xl":"1.875rem",
    "4xl":"2.25rem",
  }),
});

// ── Spacing & radius ───────────────────────────────────────────────────────────

export const GHOST_SPACING = Object.freeze({
  /** Base 4-point grid values (in px) */
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96,
});

export const GHOST_RADIUS = Object.freeze({
  xs: "8px",
  sm: "10px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "28px",
  full: "9999px",
});

// ── Animation presets ──────────────────────────────────────────────────────────

export const GHOST_ANIMATION = Object.freeze({
  /** CSS duration values */
  duration: Object.freeze({
    fast:   "150ms",
    normal: "250ms",
    slow:   "400ms",
    slower: "600ms",
  }),
  /** CSS easing curves */
  easing: Object.freeze({
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
    spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
    decel:  "cubic-bezier(0, 0, 0.2, 1)",
  }),
});

// ── Theme bundles ──────────────────────────────────────────────────────────────

interface GhostTheme {
  name:        string;
  label:       string;
  description: string;
  bg:          string;
  surface:     string;
  accent:      string;
  text:        string;
  border:      string;
  /** CSS custom-property block injected into :root when theme is active. */
  cssVars:     Readonly<Record<string, string>>;
}

export const GHOST_THEMES: Readonly<Record<string, Readonly<GhostTheme>>> = Object.freeze({
  dark: Object.freeze({
    name:        "dark",
    label:       "Ghost Dark",
    description: "High-contrast dark theme with Ghost Green accents.",
    bg:          GHOST_PALETTE.neutral[950],
    surface:     GHOST_PALETTE.neutral[900],
    accent:      GHOST_PALETTE.ghost[400],
    text:        GHOST_PALETTE.neutral[50],
    border:      GHOST_PALETTE.neutral[800],
    cssVars: Object.freeze({
      "--gh-bg":            GHOST_PALETTE.neutral[950],
      "--gh-bg-secondary":  GHOST_PALETTE.neutral[900],
      "--gh-surface":       GHOST_PALETTE.neutral[900],
      "--gh-surface-raised":GHOST_PALETTE.neutral[850],
      "--gh-accent":        GHOST_PALETTE.ghost[400],
      "--gh-accent-gold":   GHOST_PALETTE.gold[400],
      "--gh-accent-blue":   GHOST_PALETTE.blue[400],
      "--gh-text":          GHOST_PALETTE.neutral[50],
      "--gh-text-secondary":GHOST_PALETTE.neutral[300],
      "--gh-text-muted":    GHOST_PALETTE.neutral[500],
      "--gh-border":        GHOST_PALETTE.neutral[800],
    }),
  }),
  light: Object.freeze({
    name:        "light",
    label:       "Ghost Light",
    description: "Clean light theme for daylight-friendly viewing.",
    bg:          GHOST_PALETTE.neutral[50],
    surface:     GHOST_PALETTE.neutral[0],
    accent:      GHOST_PALETTE.ghost[500],
    text:        GHOST_PALETTE.neutral[900],
    border:      GHOST_PALETTE.neutral[200],
    cssVars: Object.freeze({
      "--gh-bg":            GHOST_PALETTE.neutral[50],
      "--gh-bg-secondary":  GHOST_PALETTE.neutral[100],
      "--gh-surface":       GHOST_PALETTE.neutral[0],
      "--gh-surface-raised":GHOST_PALETTE.neutral[50],
      "--gh-accent":        GHOST_PALETTE.ghost[500],
      "--gh-accent-gold":   GHOST_PALETTE.gold[500],
      "--gh-accent-blue":   GHOST_PALETTE.blue[500],
      "--gh-text":          GHOST_PALETTE.neutral[900],
      "--gh-text-secondary":GHOST_PALETTE.neutral[600],
      "--gh-text-muted":    GHOST_PALETTE.neutral[400],
      "--gh-border":        GHOST_PALETTE.neutral[200],
    }),
  }),
  highcontrast: Object.freeze({
    name:        "highcontrast",
    label:       "High Contrast",
    description: "WCAG AA enhanced contrast for accessibility.",
    bg:          "#000000",
    surface:     "#0a0a0a",
    accent:      "#00ffcc",
    text:        "#ffffff",
    border:      "#444444",
    cssVars: Object.freeze({
      "--gh-bg":            "#000000",
      "--gh-bg-secondary":  "#0a0a0a",
      "--gh-surface":       "#0a0a0a",
      "--gh-surface-raised":"#111111",
      "--gh-accent":        "#00ffcc",
      "--gh-accent-gold":   "#ffe066",
      "--gh-accent-blue":   "#80b3ff",
      "--gh-text":          "#ffffff",
      "--gh-text-secondary":"#dddddd",
      "--gh-text-muted":    "#aaaaaa",
      "--gh-border":        "#444444",
    }),
  }),
});
