/* Verbatim token mapping from the build spec (build-pack.md section 2.1).
   Any change here must also be made in the spec - this file is the compiled form of it. */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0A0D0B',
          sunken: '#070A08',
          surface: '#121713',
          raised: '#171E19',
          hover: '#1D251F',
        },
        line: { subtle: 'rgba(255,255,255,0.06)', strong: 'rgba(255,255,255,0.11)' },
        fg: {
          DEFAULT: '#E6EDE8',
          secondary: '#9BACA0',
          muted: '#6A7A6F',
          disabled: '#47524A',
          onAccent: '#06110B',
        },
        accent: {
          400: '#7BE0A8',
          500: '#4FD18B',
          600: '#35A96D',
          tint: 'rgba(79,209,139,0.12)',
          glow: 'rgba(79,209,139,0.28)',
        },
        clay: { 400: '#E39A72', 500: '#D9845F', tint: 'rgba(217,132,95,0.12)' },
        warning: '#E0A458',
        danger: { DEFAULT: '#D9645C', tint: 'rgba(217,100,92,0.12)' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        micro: ['11px', { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '500' }],
        small: ['13px', { lineHeight: '1.5' }],
        body: ['15px', { lineHeight: '1.6' }],
        'body-lg': ['17px', { lineHeight: '1.65' }],
        h3: ['20px', { lineHeight: '1.3', letterSpacing: '-0.005em' }],
        h2: ['28px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        h1: ['40px', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        display: ['56px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      borderRadius: { micro: '4px', input: '8px', btn: '10px', card: '16px', panel: '20px' },
      boxShadow: {
        l1: 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
        l2: '0 12px 32px rgba(0,0,0,0.45)',
        l4: '0 8px 32px rgba(79,209,139,0.28)',
      },
      transitionTimingFunction: { base: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      maxWidth: { reading: '68ch' },
      spacing: { sidebar: '248px', topnav: '64px', content: '1200px' },
      keyframes: {
        'grow-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(1.18)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'grow-pulse': 'grow-pulse 1.6s ease-in-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
