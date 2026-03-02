import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ── GhostStack Brand Color Palette ──────────────────────────────────
      colors: {
        // Core brand
        'phantom-black':   '#0B0F14',
        'spectral-purple': '#7A5CFF',
        'ghost-blue':      '#00C2FF',
        'neural-teal':     '#00F0B5',
        'sovereign-gold':  '#C9A227',
        'signal-red':      '#FF3B3B',
        'ghost-white':     '#E8EDF5',
        'phantom-mist':    '#8A9BB5',

        // Layer accent aliases
        'l1': '#C9A227',   // Sovereign Gold
        'l2': '#7A5CFF',   // Spectral Purple
        'l3': '#00C2FF',   // Ghost Blue
        'ai': '#00F0B5',   // Neural Teal

        // Extended shades
        ghost: {
          50:  '#f0f4ff',
          100: '#dde5ff',
          200: '#c0ccff',
          300: '#9aaaff',
          400: '#7A5CFF',  // Spectral Purple (primary)
          500: '#5a3cdf',
          600: '#4428b8',
          700: '#321a90',
          800: '#1e0f68',
          900: '#0B0F14',  // Phantom Black
          950: '#060810',
        },
      },

      // ── GhostStack Typography ────────────────────────────────────────────
      fontFamily: {
        display: ['Orbitron', 'system-ui', 'sans-serif'],
        heading: ['Sora', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },

      // ── Letter Spacing ───────────────────────────────────────────────────
      letterSpacing: {
        'sovereign': '0.12em',
        'display':   '0.08em',
        'section':   '0.06em',
        'label':     '0.14em',
      },

      // ── Border Radius ────────────────────────────────────────────────────
      borderRadius: {
        'xs': '8px',
        'sm': '10px',
        'md': '14px',
        'lg': '18px',
        'xl': '22px',
      },

      // ── Box Shadows (brand glow system) ─────────────────────────────────
      boxShadow: {
        'glow-purple': '0 0 24px rgba(122,92,255,0.35)',
        'glow-blue':   '0 0 24px rgba(0,194,255,0.35)',
        'glow-teal':   '0 0 24px rgba(0,240,181,0.35)',
        'glow-gold':   '0 0 24px rgba(201,162,39,0.35)',
        'glow-red':    '0 0 24px rgba(255,59,59,0.35)',
        'panel':       '0 20px 60px rgba(0,0,0,0.4)',
        'card':        '0 8px 32px rgba(0,0,0,0.3)',
      },

      // ── Background Images ────────────────────────────────────────────────
      backgroundImage: {
        'ghost-grid':
          'linear-gradient(rgba(122,92,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(122,92,255,0.04) 1px, transparent 1px)',
        'sovereign-gradient':
          'linear-gradient(135deg, #0B0F14 0%, #12172a 50%, #0B0F14 100%)',
        'l1-gradient':
          'linear-gradient(135deg, rgba(201,162,39,0.15), rgba(201,162,39,0.05))',
        'l2-gradient':
          'linear-gradient(135deg, rgba(122,92,255,0.15), rgba(122,92,255,0.05))',
        'l3-gradient':
          'linear-gradient(135deg, rgba(0,194,255,0.15), rgba(0,194,255,0.05))',
        'ai-gradient':
          'linear-gradient(135deg, rgba(0,240,181,0.15), rgba(0,240,181,0.05))',
      },

      // ── Animations ───────────────────────────────────────────────────────
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(122,92,255,0.4)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(122,92,255,0)' },
        },
        'scan-line': {
          from: { transform: 'translateY(-100%)' },
          to:   { transform: 'translateY(100vh)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'rise':       'rise 0.4s ease-out forwards',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line':  'scan-line 4s linear infinite',
        'float':      'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
