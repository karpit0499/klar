// Klar service worker (feature 8.2). A small, hand-rolled cache so the app shell
// loads offline. We cache the app's own assets on demand (stale-while-revalidate)
// and NEVER touch the job APIs or the Groq/Worker calls — those must always be
// live, and caching them would be both wrong and a privacy risk.
const CACHE = 'klar-shell-v1'

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