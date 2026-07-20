import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages project sites the app is served from /<repo>/.
// Set to '/klar/' for production; '/' for local dev.
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/klar/' : '/',
})