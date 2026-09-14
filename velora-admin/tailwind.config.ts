import type { Config } from 'tailwindcss';

// VELORA brand: white/black base with a restrained yellow-gold accent —
// matches the existing mobile app's identity (src/theme/colors.ts) so the
// admin website reads as the same product, not a different company's panel.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        velora: {
          black: '#0B0B0C',
          charcoal: '#1A1A1C',
          gold: '#E8B923',
          goldDark: '#C79A16',
          surface: '#F7F7F5',
          border: '#E4E4E1',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
