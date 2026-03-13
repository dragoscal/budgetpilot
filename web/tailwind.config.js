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
        /* ── Nordic Clarity palette ─────────────────────────── */
        /* Using Tailwind's slate scale as neutral base */
        cream: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        accent: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        success: { DEFAULT: '#059669', light: '#ECFDF5' },
        warning: { DEFAULT: '#D97706', light: '#FFFBEB' },
        danger:  { DEFAULT: '#DC2626', light: '#FEF2F2' },
        info:    { DEFAULT: '#0EA5E9', light: '#F0F9FF' },
        income:  { DEFAULT: '#059669', light: '#ECFDF5' },
        dark: {
          bg:     '#0B0F1A',
          card:   '#111827',
          border: '#1E293B',
          text:   '#F8FAFC',
        },
      },
      fontFamily: {
        heading: ['"Instrument Serif"', 'serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
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
        'sm':    '0 1px 2px rgba(0,0,0,0.04)',
        'md':    '0 4px 12px rgba(0,0,0,0.06)',
        'lg':    '0 8px 24px rgba(0,0,0,0.08)',
        'focus': '0 0 0 3px rgba(79,70,229,0.15)',
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
          '0%': { boxShadow: '0 0 0 0 rgba(79,70,229,.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(79,70,229,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(79,70,229,0)' },
        },
      },
    },
  },
  plugins: [],
};
