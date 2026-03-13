import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── Meridian — Warm Editorial palette ─────────────── */
        cream: {
          50:  '#FAF9F6',
          100: '#F3F1EC',
          200: '#E6E2DB',
          300: '#D4CEC4',
          400: '#A39D94',
          500: '#7A7368',
          600: '#5C554B',
          700: '#403B35',
          800: '#26221E',
          900: '#141413',
        },
        accent: {
          50:  '#F0FAF7',
          100: '#D1F2EA',
          200: '#A3E5D5',
          300: '#6DD4BF',
          400: '#3DB89A',
          500: '#229E83',
          600: '#1B7A6E',
          700: '#16635A',
          800: '#124D46',
          900: '#0D3A33',
        },
        success: { DEFAULT: '#059669', light: '#ECFDF5' },
        warning: { DEFAULT: '#D97706', light: '#FFFBEB' },
        danger:  { DEFAULT: '#DC2626', light: '#FEF2F2' },
        info:    { DEFAULT: '#0EA5E9', light: '#F0F9FF' },
        income:  { DEFAULT: '#059669', light: '#ECFDF5' },
        dark: {
          bg:     '#0E100F',
          card:   '#181A19',
          border: '#2A2C2B',
          text:   '#F3F1EC',
        },
      },
      fontFamily: {
        heading: ['"Newsreader"', 'Georgia', 'serif'],
        body: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
      },
      maxWidth: {
        content: '1000px',
      },
      width: {
        sidebar: '220px',
        'sidebar-collapsed': '56px',
      },
      margin: {
        sidebar: '220px',
        'sidebar-collapsed': '56px',
      },
      boxShadow: {
        'sm':    '0 1px 2px rgba(20,20,19,0.04)',
        'md':    '0 4px 12px rgba(20,20,19,0.05)',
        'lg':    '0 8px 24px rgba(20,20,19,0.07)',
        'focus': '0 0 0 3px rgba(27,122,110,0.15)',
      },
      animation: {
        fadeUp: 'fadeUp 0.2s ease-out',
        slideIn: 'slideIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'pulse-add': 'pulseAdd 2s ease-in-out 0.5s 1',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseAdd: {
          '0%': { boxShadow: '0 0 0 0 rgba(27,122,110,.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(27,122,110,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(27,122,110,0)' },
        },
      },
    },
  },
  plugins: [],
};
