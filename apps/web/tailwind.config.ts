import type { Config } from 'tailwindcss';

/**
 * GhostChain Tailwind Config
 * Brand token reference: packages/brand-enforcer/src/rules.js
 * Design tokens mirror globals.css CSS custom properties.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}'
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // ── GhostChain brand palette ─────────────────────────────────────────
        ghost: {
          // Primary accent — #23d6a6 (Ghost Green)
          DEFAULT:  '#23d6a6',
          50:       '#edfdf8',
          100:      '#d0fbef',
          200:      '#a4f7df',
          300:      '#67eece',
          400:      '#2eddb6',
          500:      '#23d6a6',  // brand canonical
          600:      '#0ba882',
          700:      '#087b60',
          800:      '#07604c',
          900:      '#064f3e',
          950:      '#022d24',
        },
        // Secondary accent — #f2c14e (Ghost Gold)
        gold: {
          DEFAULT:  '#f2c14e',
          400:      '#f7d577',
          500:      '#f2c14e',  // brand canonical
          600:      '#e6a325',
          700:      '#c6891d',
        },
        // Tertiary — #7aa2ff (Ghost Blue)
        blue: {
          DEFAULT:  '#7aa2ff',
          400:      '#a3bcff',
          500:      '#7aa2ff',  // brand canonical
          600:      '#3d6df6',
          700:      '#2451d5',
        },
        // Semantic
        danger:   { DEFAULT: '#ff6b6b', dark: '#d14b4b' },
        success:  { DEFAULT: '#72f2a7', dark: '#1e8f6c' },
        warning:  { DEFAULT: '#f2c14e', dark: '#c6891d' },

        // ── Surface colors ────────────────────────────────────────────────────
        surface: {
          bg:      'var(--bg)',
          bg2:     'var(--bg-2)',
          panel:   'var(--panel)',
          strong:  'var(--panel-strong)',
          border:  'var(--border)',
        },
        text: {
          DEFAULT: 'var(--text)',
          muted:   'var(--muted)',
        },
      },
      fontFamily: {
        body:    ['Space Grotesk', 'Sora', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Space Grotesk', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Cascadia Code', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        xs:   '8px',
        sm:   '10px',
        md:   '14px', // default component radius
        lg:   '18px',
        xl:   '22px',
        '2xl':'28px',
      },
      boxShadow: {
        soft:   '0 18px 50px rgba(0,0,0,0.25)',
        glow:   '0 20px 60px rgba(35,214,166,0.2)',
        'glow-strong': '0 0 40px rgba(35,214,166,0.35)',
        card:   '0 4px 24px rgba(0,0,0,0.18)',
      },
      animation: {
        'pulse-ghost': 'pulse-ghost 2s ease-in-out infinite',
        'fade-in':     'fade-in 0.2s ease-out',
        'slide-up':    'slide-up 0.25s ease-out',
        'glow-ring':   'glow-ring 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-ghost': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(35,214,166,0)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(35,214,166,0.15)' },
        },
      },
      backgroundImage: {
        'ghost-radial': 'radial-gradient(circle, rgba(35,214,166,0.08) 0%, transparent 70%)',
        'ghost-grid':   'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
        'ghost-conic':  'conic-gradient(from 220deg at 50% 50%, #23d6a6 0deg, #7aa2ff 120deg, #f2c14e 240deg, #23d6a6 360deg)',
      },
    },
  },
  plugins: [],
};

export default config;
