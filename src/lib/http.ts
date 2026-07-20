// ============================================================================
// Fetch helpers with per-source routing.
//
// Direct (browser → upstream): Arbeitnow, Greenhouse, Lever, Ashby, Groq —
//   all send permissive CORS headers, verified.
// Proxied (browser → your Worker → upstream): BA and Adzuna only — they send
//   no CORS headers, and Adzuna also needs a secret key the Worker injects.
// ============================================================================
import { WORKER_URL } from './config'

/** GET a URL and parse JSON, with a helpful error if the response isn't ok. */
export async function getJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(url, { headers: opts.headers, signal: opts.signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `HTTP ${res.status} ${res.statusText} for ${url}` +
        (body ? ` — ${body.slice(0, 160)}` : ''),
    )
  }
  return (await res.json()) as T
}

/**
 * Build a URL that targets YOUR Worker's proxy route.
 * `route` is 'ba' or 'adzuna'; `pathAndQuery` is everything after the route,
 * e.g. workerUrl('ba', '/pc/v4/jobs?was=data&wo=Berlin').
 * Throws early with a clear message if the Worker URL isn't configured.
 */
export function workerUrl(route: 'ba' | 'adzuna', pathAndQuery: string): string {
  if (!WORKER_URL) {
    throw new Error(
      'VITE_WORKER_URL is not set. Create app/.env.local with ' +
        'VITE_WORKER_URL=https://<your-worker>.workers.dev (see Phase 0).',
    )
  }
  const sep = pathAndQuery.startsWith('/') ? '' : '/'
  return `${WORKER_URL}/${route}${sep}${pathAndQuery}`
}