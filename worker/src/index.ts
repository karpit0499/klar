// ============================================================================
// Klar proxy Worker. The app calls this for sources that cannot be called
// directly from the browser:
//   • BA (rest.arbeitsagentur.de) — no CORS. We inject the public API key.
//   • Adzuna (api.adzuna.com)     — no CORS + needs a key we inject.
//   • Groq                       — browser-safe fixed relay for a user's own key.
// Everything else (Arbeitnow, Greenhouse, Lever, Ashby) is called directly by
// the browser and never touches this Worker.
//
// Security: this is NOT an open proxy. Every upstream host and endpoint is
// fixed in code. Anything else → 404.
//
// v2 (feature 4): Adzuna credentials may come from the USER (relayed per-request
// via X-Adzuna-App-Id / X-Adzuna-App-Key headers) OR from Worker secrets. User
// keys are relayed, never stored. This is an acceptable trade — Adzuna keys are
// low-sensitivity, read-only job data. The user's Groq key is relayed only in an
// Authorization header for the duration of one fixed request. It is never
// stored, logged by application code, placed in a URL, or echoed in a response.
// ============================================================================
import { fabricFetch, isFabricFailure } from './fabric'
import { proxyGroqRequest } from './groq'

type KlarEnv = Env & {
  // Set via: npx wrangler secret put ADZUNA_APP_ID   (and ADZUNA_APP_KEY)
  ADZUNA_APP_ID?: string
  ADZUNA_APP_KEY?: string
}

const UPSTREAMS = {
  ba: 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service',
  adzuna: 'https://api.adzuna.com',
} as const

type Route = keyof typeof UPSTREAMS

/** Adzuna credentials supplied per-request by the user (feature 4). */
export type UserAdzunaKeys = { appId?: string; appKey?: string }
export type AdzunaCredentialSelection =
  | { ok: true; source: 'user' | 'worker'; appId: string; appKey: string }
  | { ok: false; reason: 'partial_user_credentials' | 'not_configured' }

/** Select one complete pair. User and Worker values are never mixed. */
export function selectAdzunaCredentials(
  env: KlarEnv,
  userKeys: UserAdzunaKeys,
): AdzunaCredentialSelection {
  const userAppId = userKeys.appId?.trim()
  const userAppKey = userKeys.appKey?.trim()
  const hasAnyUserValue = Boolean(userAppId || userAppKey)
  if (hasAnyUserValue) {
    if (userAppId && userAppKey) {
      return { ok: true, source: 'user', appId: userAppId, appKey: userAppKey }
    }
    return { ok: false, reason: 'partial_user_credentials' }
  }
  const workerAppId = env.ADZUNA_APP_ID?.trim()
  const workerAppKey = env.ADZUNA_APP_KEY?.trim()
  if (workerAppId && workerAppKey) {
    return { ok: true, source: 'worker', appId: workerAppId, appKey: workerAppKey }
  }
  return { ok: false, reason: 'not_configured' }
}

/** Pick the CORS origin to echo, honoring an optional allow-list. */
export function corsOrigin(requestOrigin: string | null, allowed?: string): string {
  if (!allowed || allowed.trim() === '*') return '*'
  const list = allowed.split(',').map((s) => s.trim()).filter(Boolean)
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin
  return list[0] ?? '*'
}

/** CORS is a browser policy, so reject an explicitly disallowed browser origin. */
export function isOriginAllowed(requestOrigin: string | null, allowed?: string): boolean {
  if (!requestOrigin || !allowed || allowed.trim() === '*') return true
  return allowed.split(',').map((value) => value.trim()).filter(Boolean).includes(requestOrigin)
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    // Allow the optional per-request source keys and Groq bearer key.
    'Access-Control-Allow-Headers':
      'authorization,content-type,x-adzuna-app-id,x-adzuna-app-key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/**
 * Build the upstream URL for a proxied route (pure + unit-tested).
 * `rest` is the path after the route prefix; `search` is the incoming query.
 * For Adzuna we append app_id/app_key, preferring the USER's keys (feature 4)
 * and falling back to the Worker's own secrets.
 */
export function buildUpstreamUrl(
  route: Route,
  rest: string,
  search: string,
  env: KlarEnv,
  userKeys: UserAdzunaKeys = {},
): string {
  const base = UPSTREAMS[route]
  const url = new URL(base + (rest.startsWith('/') ? rest : '/' + rest))
  // Carry through the caller's query params (but never let the caller smuggle
  // app_id/app_key via the query string — those come from headers or secrets).
  const incoming = new URLSearchParams(search)
  incoming.delete('app_id')
  incoming.delete('app_key')
  incoming.forEach((v, k) => url.searchParams.set(k, v))
  if (route === 'adzuna') {
    const selected = selectAdzunaCredentials(env, userKeys)
    if (selected.ok) {
      url.searchParams.set('app_id', selected.appId)
      url.searchParams.set('app_key', selected.appKey)
    }
  }
  return url.toString()
}

/** True when Adzuna credentials are available from EITHER the user or the Worker. */
export function adzunaConfigured(env: KlarEnv, userKeys: UserAdzunaKeys): boolean {
  return selectAdzunaCredentials(env, userKeys).ok
}

function appError(
  category: 'credentials' | 'rate_limit' | 'network' | 'source',
  message: string,
  action: string,
  technical: string,
): Record<string, unknown> {
  return {
    category,
    message,
    dataSafe: true,
    available: 'Other job sources and saved local data remain available.',
    action: {
      label: action,
      kind: category === 'credentials' ? 'open_settings' : 'retry',
    },
    technical,
  }
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  })
}

export default {
  async fetch(request: Request, env: KlarEnv): Promise<Response> {
    const requestOrigin = request.headers.get('Origin')
    const origin = corsOrigin(requestOrigin, env.ALLOWED_ORIGINS)

    if (!isOriginAllowed(requestOrigin, env.ALLOWED_ORIGINS)) {
      return new Response(JSON.stringify({ error: 'origin not allowed' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }

    // CORS preflight.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const url = new URL(request.url)
    const segments = url.pathname.replace(/^\/+/, '').split('/')
    const route = segments[0]

    // Browser-safe Groq relay. This is handled before the GET-only source routes.
    if (route === 'groq') {
      const result = await proxyGroqRequest(request, segments.slice(1).join('/'))
      return new Response(result.body, {
        status: result.status,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          ...corsHeaders(origin),
        },
      })
    }

    // Every non-Groq route is read-only.
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, origin)
    }

    if (route === 'health' || url.pathname === '/') {
      return json({ ok: true, service: 'klar-proxy' }, 200, origin)
    }

    // v2.4 Source Fabric — allowlisted retrieval for employer-direct connectors.
    if (route === 'fabric') {
      const host = url.searchParams.get('host') ?? ''
      const path = url.searchParams.get('path') ?? ''
      const acceptParam = url.searchParams.get('accept') ?? 'json'
      const accept: 'json' | 'xml' | 'text' =
        acceptParam === 'xml' || acceptParam === 'text' ? acceptParam : 'json'
      const maxBytes = Number(url.searchParams.get('max') ?? '0') || 0
      const result = await fabricFetch({ host, path, accept, maxBytes })
      if (isFabricFailure(result)) return json({ error: result.error }, result.httpStatus, origin)
      return json(result, 200, origin)
    }

    if (route !== 'ba' && route !== 'adzuna') {
      return json({ error: 'unknown route' }, 404, origin)
    }

    // Per-request Adzuna credentials from the user (feature 4).
    const userKeys: UserAdzunaKeys = {
      appId: request.headers.get('X-Adzuna-App-Id') || undefined,
      appKey: request.headers.get('X-Adzuna-App-Key') || undefined,
    }

    if (route === 'adzuna') {
      const selected = selectAdzunaCredentials(env, userKeys)
      if (!selected.ok) {
        const partial = selected.reason === 'partial_user_credentials'
        return json(
          {
            error: appError(
              'credentials',
              partial
                ? 'Adzuna needs both the App ID and App key from the same account.'
                : 'Adzuna credentials are not configured.',
              partial ? 'Enter both Adzuna values' : 'Add Adzuna credentials in Settings',
              selected.reason,
            ),
          },
          partial ? 400 : 503,
          origin,
        )
      }
    }

    const rest = '/' + segments.slice(1).join('/')
    const upstreamUrl = buildUpstreamUrl(route, rest, url.search, env, userKeys)

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (route === 'ba') headers['X-API-Key'] = 'jobboerse-jobsuche'

    let upstream: Response
    try {
      upstream = await fetch(upstreamUrl, { headers })
    } catch (error) {
      return json(
        { error: appError('network', 'The upstream job source could not be reached.', 'Try again', error instanceof Error ? error.message : 'upstream_unreachable') },
        502,
        origin,
      )
    }

    const sourceName = route === 'adzuna' ? 'Adzuna' : 'Bundesagentur'

    if (upstream.status === 401 || upstream.status === 403) {
      return json(
        { error: appError(
          route === 'adzuna' ? 'credentials' : 'source',
          `${sourceName} rejected the request.`,
          route === 'adzuna' ? 'Check credentials in Settings' : 'Retry this source',
          `upstream_http_${upstream.status}`,
        ) },
        upstream.status,
        origin,
      )
    }
    if (upstream.status === 429) {
      return json(
        { error: appError('rate_limit', `${sourceName} has reached its request limit.`, 'Try again later', 'upstream_http_429') },
        429,
        origin,
      )
    }
    if (upstream.status >= 500) {
      return json(
        { error: appError('source', `${sourceName} is temporarily unavailable.`, 'Try again later', `upstream_http_${upstream.status}`) },
        502,
        origin,
      )
    }

    // Adzuna returns an HTML error page when the daily free-tier cap is hit.
    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      const rateLimited = route === 'adzuna'
      return json(
        {
          error: appError(
            rateLimited ? 'rate_limit' : 'source',
            rateLimited ? 'Adzuna returned a quota or rate-limit response.' : 'The source returned an unreadable response.',
            rateLimited ? 'Try again later' : 'Retry the source',
            'non_json_upstream',
          ),
        },
        rateLimited ? 429 : 502,
        origin,
      )
    }

    // Stream the bounded-by-upstream JSON directly instead of buffering it.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        ...corsHeaders(origin),
      },
    })
  },
} satisfies ExportedHandler<KlarEnv>
