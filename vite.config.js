import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/kokoro-inventario-info/',
  build: {
    outDir: 'dist/kokoro-inventario-info',
    emptyOutDir: true,
  },
  plugins: [react()],
})
