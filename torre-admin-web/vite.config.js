import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Esto ya lo tenías para exponer el frontend
    proxy: {
      // Cualquier petición que empiece con /api se redirige al backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // También proxifica las imágenes/comprobantes si las sirves desde /uploads
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})