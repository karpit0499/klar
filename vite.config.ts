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

// The web release lives at /klar/ on GitHub Pages. A packaged Electron
// renderer loads over file:// and therefore needs relative asset URLs.
const productionBase =
  process.env.KLAR_BUILD_TARGET === 'desktop' ? './' : '/klar/'

export default defineConfig({
  plugins: [react(), releaseMetadata()],
  base: process.env.NODE_ENV === 'production' ? productionBase : '/',
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