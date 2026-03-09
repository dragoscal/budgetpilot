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
          50: '#fdfcf9',
          100: '#faf8f3',
          200: '#f5f0e6',
          300: '#ede8de',
          400: '#e8e0d4',
          500: '#c4b9a8',
          600: '#a99e8f',
          700: '#8a7e6d',
          800: '#6b6256',
          900: '#2d2a24',
        },
        success: { DEFAULT: '#3a7d5c', light: '#e8f5ee' },
        warning: { DEFAULT: '#c9773c', light: '#fef3e8' },
        danger: { DEFAULT: '#d44f4f', light: '#fdeaea' },
        info: { DEFAULT: '#4a7fa5', light: '#e8f1f8' },
        income: { DEFAULT: '#2d8a4e', light: '#e6f7ec' },
        dark: {
          bg: '#1a1a1f',
          card: '#242429',
          border: '#2e2e34',
          text: '#e8e4dc',
        },
      },
      fontFamily: {
        heading: ['Fraunces', 'serif'],
        body: ['Outfit', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      maxWidth: {
        content: '1000px',
      },
      width: {
        sidebar: '220px',
        'sidebar-collapsed': '60px',
      },
      margin: {
        sidebar: '220px',
        'sidebar-collapsed': '60px',
      },
      animation: {
        fadeUp: 'fadeUp 0.35s ease-out',
        slideIn: 'slideIn 0.3s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
