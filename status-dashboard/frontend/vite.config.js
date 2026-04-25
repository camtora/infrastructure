import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: {
      // Proxy /api/* to the live GCP Cloud Run backend for local dev
      '/api': {
        target: 'https://status-dashboard-jkdghbnxoq-uc.a.run.app',
        changeOrigin: true,
      },
    },
  },
})
