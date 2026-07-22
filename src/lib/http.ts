// ============================================================================
// Fetch helpers with per-source routing.
//
// Direct (browser → upstream): Arbeitnow, Greenhouse, Lever, Ashby, Groq —
//   all send permissive CORS headers, verified.
// Proxied (browser → your Worker → upstream): BA and Adzuna only — they send
//   no CORS headers, and Adzuna also needs a secret key the Worker injects.
// ============================================================================
import { WORKER_URL } from './config'
import { AppError, isAppErrorData } from '../errors/appError'

/** GET a URL and parse JSON, with a helpful error if the response isn't ok. */
export async function getJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { headers: opts.headers, signal: opts.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AppError({
        category: 'network',
        message: 'Klar could not reach this service.',
        dataSafe: true,
        available: 'Saved jobs and other local features still work.',
        action: { label: 'Check the connection and retry', kind: 'retry' },
        technical: error instanceof Error ? error.message : String(error),
      })
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    try {
      const parsed = JSON.parse(body) as { error?: unknown }
      if (isAppErrorData(parsed.error)) throw new AppError(parsed.error)
    } catch (error) {
      if (error instanceof AppError) throw error
    }
    const category = res.status === 429 ? 'rate_limit' : res.status === 401 || res.status === 403 ? 'credentials' : 'source'
    throw new AppError({
      category,
      message:
        category === 'rate_limit'
          ? 'This source has reached its request limit.'
          : category === 'credentials'
            ? 'This source rejected its credentials.'
            : 'This job source returned an error.',
      dataSafe: true,
      available: 'Other sources and saved local data remain available.',
      action: {
        label: category === 'credentials' ? 'Check credentials in Settings' : 'Try this source again',
        kind: category === 'credentials' ? 'open_settings' : 'retry',
      },
      technical: `HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 240)}` : ''}`,
    })
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