import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    viteCompression({ algorithm: 'gzip', threshold: 1024 }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — cached long-term, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Charts — only loaded on pages that use them
          'vendor-charts': ['recharts'],
          // Date utilities
          'vendor-date': ['date-fns'],
          // Icons
          'vendor-icons': ['lucide-react'],
          // IndexedDB
          'vendor-idb': ['idb'],
        },
      },
    },
  },
});
