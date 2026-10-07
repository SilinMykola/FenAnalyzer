import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api requests to FastAPI backend so we don't have to hardcode ports in frontend
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // jsdom gives tests a browser-like document to render components into
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
