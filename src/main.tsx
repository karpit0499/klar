import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LocaleProvider } from './i18n/LocaleProvider'
import { APP_VERSION, isNewerRelease, latestPublishedVersion } from './lib/version'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>,
)

let updateNoticeShown = false

function showUpdateNotice(version?: string): void {
  if (updateNoticeShown) return
  updateNoticeShown = true
  const notice = document.createElement('div')
  notice.setAttribute('role', 'status')
  notice.className =
    'fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[100] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-ink shadow-lg'

  const text = document.createElement('span')
  text.className = 'text-sm'
  text.textContent = version
    ? `Klar ${version} is ready. Reload to use the latest fixes.`
    : 'A Klar update is ready. Reload to use the latest fixes.'

  const button = document.createElement('button')
  button.type = 'button'
  button.className =
    'min-h-tap shrink-0 rounded-md bg-ink px-3 py-2 text-sm font-medium text-surface'
  button.textContent = 'Reload'
  button.addEventListener('click', () => window.location.reload())
  notice.append(text, button)
  document.body.appendChild(notice)
}

async function checkForRelease(): Promise<void> {
  try {
    const published = await latestPublishedVersion()
    if (isNewerRelease(published)) showUpdateNotice(published ?? undefined)
  } catch {
    // Release checks are a progressive enhancement and must never block Klar.
  }
}

// Register the service worker for offline support (feature 8.2). Only in a
// production build, and using the app's base path so it works on GitHub Pages
// project sites served from /<repo>/.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker
      .register(swUrl, { updateViaCache: 'none' })
      .then(async (registration) => {
        await registration.update()
        await checkForRelease()
      })
      .catch(() => {
        /* offline support is a progressive enhancement — ignore failures */
      })
  })

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; version?: unknown } | null
    if (data?.type === 'KLAR_RELEASE_AVAILABLE') {
      showUpdateNotice(typeof data.version === 'string' ? data.version : undefined)
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForRelease()
  })
  window.addEventListener('online', () => void checkForRelease())
  window.setInterval(() => void checkForRelease(), 5 * 60 * 1000)
}

// Exposed only as a stable DOM value for support screenshots and browser QA.
document.documentElement.dataset.klarVersion = APP_VERSION
