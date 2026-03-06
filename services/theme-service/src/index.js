/**
 * GhostChain Theme Service
 *
 * Provides canonical GhostChain design tokens and theme configuration to
 * all frontend consumers. Tokens are synchronized with apps/web/app/globals.css
 * and packages/ui/src/components/*.
 *
 * GET  /health       — liveness probe
 * GET  /theme        — full design token set for the configured theme
 * GET  /themes       — list all available themes
 * GET  /tokens       — raw token manifest (colour + typography + spacing)
 * GET  /logo         — SVG logo markup (inline-safe)
 *
 * Port default: 7634 (THEME_SERVICE_PORT env to override)
 */

import express from "express";

const PORT = Number(process.env.THEME_SERVICE_PORT || process.env.PORT || 7634);
const THEME = (process.env.UI_THEME || "dark").toLowerCase();

const app = express();
app.use(express.json());

// ── Brand canonical constants ─────────────────────────────────────────────────
const BRAND = Object.freeze({
  name:    "GhostChain",
  symbol:  "GST",
  decimals: 18,
  unit:    "GST_UNIT",
  tagline: "Sovereign L1 · L2 · L3",
  url:     "https://ghostchain.io",
  chain:   "GhostChain",
});

// ── Raw colour palette ────────────────────────────────────────────────────────
const PALETTE = Object.freeze({
  // Ghost Green — primary accent
  ghost: {
    50:  "#edfdf8",
    100: "#d0fbef",
    200: "#a4f7df",
    300: "#67eece",
    400: "#2eddb6",
    500: "#23d6a6",   // canonical brand accent
    600: "#0ba882",
    700: "#087b60",
    800: "#07604c",
    900: "#064f3e",
    950: "#022d24",
  },
  // Ghost Gold — secondary accent
  gold: {
    400: "#f7d577",
    500: "#f2c14e",   // canonical
    600: "#e6a325",
    700: "#c6891d",
  },
  // Ghost Blue — tertiary accent
  blue: {
    400: "#a3bcff",
    500: "#7aa2ff",   // canonical
    600: "#3d6df6",
    700: "#2451d5",
  },
  // Neutrals
  neutral: {
    50:   "#f8fafc",
    100:  "#ebf0f7",
    200:  "#d2dce9",
    300:  "#9fb1c8",
    400:  "#6b7e96",
    500:  "#4f5f73",
    600:  "#374557",
    700:  "#1e2a38",
    800:  "#111827",
    900:  "#0a0f1b",
    950:  "#05070f",
  },
  // Semantic
  danger:  { DEFAULT: "#ff6b6b", dark: "#d14b4b" },
  success: { DEFAULT: "#72f2a7", dark: "#1e8f6c" },
  warning: { DEFAULT: "#f2c14e", dark: "#c6891d" },
});

// ── Theme definitions ─────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:         "#05070f",
    bg2:        "#0a0f1b",
    panel:      "rgba(10,16,28,0.82)",
    panelStrong:"rgba(8,12,22,0.92)",
    text:       "#ebf0f7",
    muted:      "#9fb1c8",
    accent:     PALETTE.ghost[500],
    accent2:    PALETTE.gold[500],
    accent3:    PALETTE.blue[500],
    border:     "rgba(255,255,255,0.08)",
    glow:       "rgba(35,214,166,0.28)",
    danger:     PALETTE.danger.DEFAULT,
    success:    PALETTE.success.DEFAULT,
    warning:    PALETTE.warning.DEFAULT,
  },
  light: {
    bg:         "#f4f3ed",
    bg2:        "#ffffff",
    panel:      "rgba(255,255,255,0.92)",
    panelStrong:"rgba(248,249,252,0.95)",
    text:       "#10131a",
    muted:      "#4f5f73",
    accent:     "#1bb388",
    accent2:    "#e6a325",
    accent3:    "#3d6df6",
    border:     "rgba(16,19,26,0.12)",
    glow:       "rgba(27,179,136,0.2)",
    danger:     PALETTE.danger.dark,
    success:    PALETTE.success.dark,
    warning:    PALETTE.warning.dark,
  },
  // High-contrast accessibility theme
  highcontrast: {
    bg:         "#000000",
    bg2:        "#0d0d0d",
    panel:      "rgba(0,0,0,0.95)",
    panelStrong:"rgba(0,0,0,1)",
    text:       "#ffffff",
    muted:      "#c0c0c0",
    accent:     "#00ffbb",
    accent2:    "#ffdd33",
    accent3:    "#6699ff",
    border:     "rgba(255,255,255,0.3)",
    glow:       "rgba(0,255,187,0.4)",
    danger:     "#ff5555",
    success:    "#55ff88",
    warning:    "#ffdd33",
  },
};

// ── Typography & spacing tokens ────────────────────────────────────────────────
const TYPOGRAPHY = Object.freeze({
  fontBody:    "'Space Grotesk', 'Sora', system-ui, -apple-system, sans-serif",
  fontDisplay: "'Sora', 'Space Grotesk', system-ui, -apple-system, sans-serif",
  fontMono:    "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
  scale: {
    xs:   "0.72rem",
    sm:   "0.84rem",
    base: "0.92rem",
    md:   "1rem",
    lg:   "1.14rem",
    xl:   "1.3rem",
    "2xl":"1.6rem",
    "3xl":"2rem",
    "4xl":"2.6rem",
  },
  weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
});

const SPACING = Object.freeze({
  0: "0px", 1: "4px", 2: "8px", 3: "12px", 4: "16px",
  5: "20px", 6: "24px", 8: "32px", 10: "40px", 12: "48px",
  16: "64px", 20: "80px",
});

const RADIUS = Object.freeze({
  xs: "8px", sm: "10px", md: "14px", lg: "18px", xl: "22px", "2xl": "28px", full: "9999px",
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const resolveTheme = (name) => {
  const key = (name || THEME).toLowerCase();
  return THEMES[key] ?? THEMES.dark;
};

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "theme-service", version: "1.1.0", brand: BRAND.name })
);

app.get("/themes", (_req, res) =>
  res.json({ ok: true, themes: Object.keys(THEMES), default: THEME })
);

app.get("/theme", (req, res) => {
  const name = req.query?.name || THEME;
  const colours = resolveTheme(name);
  res.json({
    ok: true,
    theme: name,
    brand: BRAND,
    colours,
    typography: TYPOGRAPHY,
    spacing: SPACING,
    radius: RADIUS,
    palette: PALETTE,
  });
});

app.get("/tokens", (_req, res) =>
  res.json({
    ok: true,
    brand: BRAND,
    palette: PALETTE,
    themes: THEMES,
    typography: TYPOGRAPHY,
    spacing: SPACING,
    radius: RADIUS,
  })
);

// Inline SVG logo for server-side render / email templates
app.get("/logo", (req, res) => {
  const fmt = req.query?.format || "svg";
  if (fmt !== "svg") {
    res.status(400).json({ ok: false, error: "Only format=svg supported" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none">
  <defs>
    <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#23d6a6"/><stop offset="60%" stop-color="#7aa2ff"/><stop offset="100%" stop-color="#f2c14e"/>
    </linearGradient>
    <linearGradient id="icon-body" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#23d6a6" stop-opacity="0.95"/><stop offset="100%" stop-color="#0ba882" stop-opacity="0.85"/>
    </linearGradient>
    <filter id="icon-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/>
    </filter>
  </defs>
  <g transform="translate(10,10)">
    <rect width="40" height="40" rx="10" fill="#0a0f1b"/>
    <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="url(#logo-grad)" stroke-width="0.7" stroke-opacity="0.4" fill="none"/>
    <path d="M20 8 C15 8 11 12.5 11 17.5 L11 28 L13.8 25 L16.5 28 L19 25.5 L20 27 L21 25.5 L23.5 28 L26.2 25 L29 28 L29 17.5 C29 12.5 25 8 20 8 Z" fill="url(#icon-body)" filter="url(#icon-glow)"/>
    <circle cx="16.5" cy="18.5" r="1.9" fill="#0a0f1b"/><circle cx="23.5" cy="18.5" r="1.9" fill="#0a0f1b"/>
    <circle cx="17.2" cy="17.8" r="0.65" fill="#23d6a6" opacity="0.9"/><circle cx="24.2" cy="17.8" r="0.65" fill="#23d6a6" opacity="0.9"/>
  </g>
  <text x="60" y="38" font-family="'Sora','Space Grotesk',system-ui,sans-serif" font-size="22" font-weight="700" letter-spacing="0.04em" fill="url(#logo-grad)">GhostChain</text>
  <text x="61" y="52" font-family="'Space Grotesk',system-ui,sans-serif" font-size="9" font-weight="500" letter-spacing="0.18em" fill="#9fb1c8">SOVEREIGN L1 · L2 · L3</text>
</svg>`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    service: "theme-service",
    msg: `GhostChain theme-service started on :${PORT}`,
    theme: THEME,
    brand: BRAND.name,
  }));
});

