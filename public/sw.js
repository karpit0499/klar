// Klar service worker (feature 8.2). A small, hand-rolled cache so the app shell
// loads offline. Navigations are network-first so a deployment never serves an
// old index.html that points at deleted hashed assets. Other same-origin assets
// are cached on demand with stale-while-revalidate.
// and NEVER touch the job APIs or the Groq/Worker calls — those must always be
// live, and caching them would be both wrong and a privacy risk.
const CACHE = 'klar-shell-v6'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()

      // v2.5.2 and older did not listen for update messages and could execute an
      // old application bundle indefinitely. This one-time service-worker
      // migration navigates those already-open clients onto the current shell.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      await Promise.all(
        clients.map(async (client) => {
          try {
            await client.navigate(client.url)
          } catch {
            // A tab can close between matchAll() and navigate().
          }
        }),
      )
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Only handle GETs for our OWN origin's static assets. Everything cross-origin
  // (job APIs, Groq, the Worker) falls through to the network untouched.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Always ask the network for release metadata. Caching it would defeat the
  // app's visible "new release available" check.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(new Request(req, { cache: 'no-store' })))
    return
  }

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const fresh = await fetch(new Request(req, { cache: 'no-store' }))
          if (fresh && fresh.status === 200) await cache.put(req, fresh.clone())
          return fresh
        } catch {
          const cached = await cache.match(req, { ignoreSearch: true })
          return cached || Response.error()
        }
      }),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      if (cached) {
        event.waitUntil(
          fetch(req)
            .then((response) =>
              response && response.status === 200
                ? cache.put(req, response.clone())
                : undefined,
            )
            .catch(() => undefined),
        )
        return cached
      }
      try {
        const response = await fetch(req)
        if (response && response.status === 200) await cache.put(req, response.clone())
        return response
      } catch {
        return Response.error()
      }
    }),
  )
})
