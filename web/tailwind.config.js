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
        cream: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        accent: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        success: { DEFAULT: '#059669', light: '#d1fae5' },
        warning: { DEFAULT: '#d97706', light: '#fef3c7' },
        danger: { DEFAULT: '#e11d48', light: '#ffe4e6' },
        info: { DEFAULT: '#0ea5e9', light: '#e0f2fe' },
        income: { DEFAULT: '#059669', light: '#d1fae5' },
        dark: {
          bg: '#0c0a09',
          card: '#1c1917',
          border: '#292524',
          text: '#fafaf9',
        },
      },
      fontFamily: {
        heading: ['Fraunces', 'serif'],
        body: ['Outfit', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
      maxWidth: {
        content: '1000px',
      },
      width: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
      },
      margin: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(28,25,23,.04), 0 6px 24px rgba(28,25,23,.06)',
        'card-hover': '0 2px 8px rgba(28,25,23,.06), 0 12px 32px rgba(28,25,23,.10)',
        'card-dark': '0 1px 3px rgba(0,0,0,.3), 0 6px 24px rgba(0,0,0,.2)',
        glow: '0 0 20px rgba(99,102,241,.15)',
      },
      animation: {
        fadeUp: 'fadeUp 0.3s ease-out',
        slideIn: 'slideIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        'pulse-slow': 'pulse 3s infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
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
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
    },
  },
  plugins: [],
};
