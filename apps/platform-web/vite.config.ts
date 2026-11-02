import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The platform shell is a plain SPA served by the gateway.
 *
 * In development Vite proxies the gateway's API and the embedded workspaces, so
 * cookies stay first-party and the Host keeps the browser's `Host` header; the
 * gateway accepts only the hostnames it was started with.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false },
      '/p': { target: 'http://127.0.0.1:8080', changeOrigin: false, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
