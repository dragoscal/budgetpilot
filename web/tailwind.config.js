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
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
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
      animation: {
        fadeUp: 'fadeUp 0.3s ease-out',
        slideIn: 'slideIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        'pulse-slow': 'pulse 3s infinite',
        float: 'float 6s ease-in-out infinite',
        'pulse-add': 'pulseAdd 2s ease-in-out 0.5s 1',
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
        pulseAdd: {
          '0%': { boxShadow: '0 0 0 0 rgba(13,148,136,.5)' },
          '50%': { boxShadow: '0 0 0 8px rgba(13,148,136,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(13,148,136,0)' },
        },
      },
    },
  },
  plugins: [],
};
