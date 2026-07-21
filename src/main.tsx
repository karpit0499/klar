import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LocaleProvider } from './i18n/LocaleProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>,
)

// Register the service worker for offline support (feature 8.2). Only in a
// production build, and using the app's base path so it works on GitHub Pages
// project sites served from /<repo>/.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* offline support is a progressive enhancement — ignore failures */
    })
  })
}