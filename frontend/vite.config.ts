import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['newsag-production.up.railway.app'],
  },
  preview: {
    allowedHosts: ['newsag-production.up.railway.app'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-clerk': ['@clerk/clerk-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})