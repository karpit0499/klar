// ============================================================================
// Fetch helpers with per-source routing.
//
// Direct (browser → upstream): Arbeitnow, Greenhouse, Lever and Ashby.
// Proxied (browser → your Worker → upstream): BA and Adzuna because they send
//   no CORS headers, plus default Groq requests for reliable browser support.
// ============================================================================
import { isAbortError } from './abort'
import { WORKER_URL } from './config'
import { AppError, appErrorFromResponseText, httpStatusErrorCategory } from '../errors/appError'

/** GET a URL and parse JSON, with a helpful error if the response isn't ok. */
export async function getJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { headers: opts.headers, signal: opts.signal })
  } catch (error) {
    if (isAbortError(error)) throw error
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
    const structured = appErrorFromResponseText(body)
    if (structured) throw structured
    const category = httpStatusErrorCategory(res.status)
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
 * e.g. workerUrl('ba', '/pc/v6/jobs?was=data&wo=Berlin').
 * Throws early with a clear message if the Worker URL isn't configured.
 */
export function workerUrl(route: 'ba' | 'adzuna', pathAndQuery: string): string {
  if (!WORKER_URL) {
    throw new Error(
      'VITE_WORKER_URL is not set. Create .env.local with ' +
        'VITE_WORKER_URL=https://<your-worker>.workers.dev (see .env.example).',
    )
  }
  const sep = pathAndQuery.startsWith('/') ? '' : '/'
  return `${WORKER_URL}/${route}${sep}${pathAndQuery}`
}