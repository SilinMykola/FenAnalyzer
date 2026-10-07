import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Not Vite's default 5173: other local projects (e.g. Docker containers)
    // often hold that port, and the browser then reaches them instead.
    port: 5180,
    // If another dev server already holds the port, fail instead of silently
    // moving to the next one. (A container on the same port but the other IP
    // family is not detected by the OS, hence the uncommon port above.)
    strictPort: true,
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
