import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Your backend server
        changeOrigin: true, // Recommended for virtual hosted sites
        // secure: false, // Uncomment if your backend is HTTPS with self-signed cert and you want to bypass warnings (use with caution)
        // rewrite: (path) => path.replace(/^\/api/, ''), // Optional: if you need to remove /api prefix when proxying
      }
    }
  }
})
