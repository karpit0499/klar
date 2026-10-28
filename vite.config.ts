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

// Applies the saved theme before first paint without an inline script, so the
// desktop Content Security Policy still holds; theme-bootstrap.js mirrors
// resolveTheme() in src/ui/theme.ts. The parser-blocking tag goes after the
// module, modulepreload and stylesheet tags that Vite adds at the end of
// <head>. Before them, it would hold the parser while the preload scanner
// fetches those modules through the service worker, and Chrome 153 refuses to
// hand such preloads to the module loader ("cross-world service worker
// resource mismatch"), fetching each affected chunk twice.
function themeBootstrap(): Plugin {
  let base = '/'
  return {
    name: 'klar-theme-bootstrap',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'script',
          attrs: { src: `${base}theme-bootstrap.js` },
          injectTo: 'head',
        },
      ],
    },
  }
}

// The web release lives at /klar/ on GitHub Pages. A packaged Electron
// renderer loads over file:// and therefore needs relative asset URLs.
const productionBase =
  process.env.KLAR_BUILD_TARGET === 'desktop' ? './' : '/klar/'

export default defineConfig({
  plugins: [react(), releaseMetadata(), themeBootstrap()],
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
