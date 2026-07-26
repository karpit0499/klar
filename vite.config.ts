import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'

function releaseMetadata(): Plugin {
  return {
    name: 'klar-release-metadata',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: packageJson.klarRelease }),
      })
    },
  }
}

// For GitHub Pages project sites the app is served from /<repo>/.
// Set to '/klar/' for production; '/' for local dev.
export default defineConfig({
  plugins: [react(), releaseMetadata()],
  base: process.env.NODE_ENV === 'production' ? '/klar/' : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react/jsx-runtime'],
          'storage-vendor': ['dexie', 'dexie-react-hooks'],
          'interaction-vendor': [
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
          ],
        },
      },
    },
  },
})
