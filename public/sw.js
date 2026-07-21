// Klar service worker (feature 8.2). A small, hand-rolled cache so the app shell
// loads offline. Navigations are network-first so a deployment never serves an
// old index.html that points at deleted hashed assets. Other same-origin assets
// are cached on demand with stale-while-revalidate.
// and NEVER touch the job APIs or the Groq/Worker calls — those must always be
// live, and caching them would be both wrong and a privacy risk.
const CACHE = 'klar-shell-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Only handle GETs for our OWN origin's static assets. Everything cross-origin
  // (job APIs, Groq, the Worker) falls through to the network untouched.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const fresh = await fetch(req)
          if (fresh && fresh.status === 200) await cache.put(req, fresh.clone())
          return fresh
        } catch {
          const cached = await cache.match(req)
          return cached || Response.error()
        }
      }),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})