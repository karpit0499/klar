// ============================================================================
// Klar proxy Worker. The app calls this ONLY for the two sources that can't be
// called directly from the browser:
//   • BA (rest.arbeitsagentur.de) — no CORS. We inject the public API key.
//   • Adzuna (api.adzuna.com)     — no CORS + needs a key we inject.
// Everything else (Arbeitnow, Greenhouse, Lever, Ashby, Groq) is called
// directly by the browser and never touches this Worker.
//
// Security: this is NOT an open proxy. It knows how to talk to exactly two
// upstream hosts, mapped from two fixed routes. Anything else → 404.
//
// v2 (feature 4): Adzuna credentials may come from the USER (relayed per-request
// via X-Adzuna-App-Id / X-Adzuna-App-Key headers) OR from Worker secrets. User
// keys are relayed, never stored. This is an acceptable trade — Adzuna keys are
// low-sensitivity, read-only job data — and it keeps the ONE crown-jewel secret,
// the user's Groq/LLM key, browser→Groq only, never touching this Worker.
// ============================================================================

export interface Env {
  // Set via: npx wrangler secret put ADZUNA_APP_ID   (and ADZUNA_APP_KEY)
  ADZUNA_APP_ID?: string
  ADZUNA_APP_KEY?: string
  // Optional: comma-separated allowed origins. Defaults to "*".
  ALLOWED_ORIGINS?: string
}

const UPSTREAMS = {
  ba: 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service',
  adzuna: 'https://api.adzuna.com',
} as const

type Route = keyof typeof UPSTREAMS

/** Adzuna credentials supplied per-request by the user (feature 4). */
export type UserAdzunaKeys = { appId?: string; appKey?: string }

/** Pick the CORS origin to echo, honoring an optional allow-list. */
export function corsOrigin(requestOrigin: string | null, allowed?: string): string {
  if (!allowed || allowed.trim() === '*') return '*'
  const list = allowed.split(',').map((s) => s.trim()).filter(Boolean)
  if (requestOrigin && list.includes(requestOrigin)) return requestOrigin
  return list[0] ?? '*'
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    // Allow the optional per-request Adzuna key headers (feature 4).
    'Access-Control-Allow-Headers': 'content-type,x-adzuna-app-id,x-adzuna-app-key',
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
  env: Env,
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
    const appId = userKeys.appId || env.ADZUNA_APP_ID
    const appKey = userKeys.appKey || env.ADZUNA_APP_KEY
    if (appId) url.searchParams.set('app_id', appId)
    if (appKey) url.searchParams.set('app_key', appKey)
  }
  return url.toString()
}

/** True when Adzuna credentials are available from EITHER the user or the Worker. */
export function adzunaConfigured(env: Env, userKeys: UserAdzunaKeys): boolean {
  return Boolean((userKeys.appId && userKeys.appKey) || (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY))
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = corsOrigin(request.headers.get('Origin'), env.ALLOWED_ORIGINS)

    // CORS preflight.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    // We only proxy GETs.
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, origin)
    }

    const url = new URL(request.url)
    const segments = url.pathname.replace(/^\/+/, '').split('/')
    const route = segments[0]

    if (route === 'health' || url.pathname === '/') {
      return json({ ok: true, service: 'klar-proxy' }, 200, origin)
    }

    if (route !== 'ba' && route !== 'adzuna') {
      return json({ error: 'unknown route' }, 404, origin)
    }

    // Per-request Adzuna credentials from the user (feature 4).
    const userKeys: UserAdzunaKeys = {
      appId: request.headers.get('X-Adzuna-App-Id') || undefined,
      appKey: request.headers.get('X-Adzuna-App-Key') || undefined,
    }

    const rest = '/' + segments.slice(1).join('/')
    const upstreamUrl = buildUpstreamUrl(route, rest, url.search, env, userKeys)

    // Adzuna needs a key (user or secret). If neither exists, fail clearly.
    if (route === 'adzuna' && !adzunaConfigured(env, userKeys)) {
      return json({ error: 'adzuna_not_configured', results: [], count: 0 }, 200, origin)
    }

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (route === 'ba') headers['X-API-Key'] = 'jobboerse-jobsuche'

    let upstream: Response
    try {
      upstream = await fetch(upstreamUrl, { headers })
    } catch {
      return json({ error: 'upstream_unreachable' }, 502, origin)
    }

    // Adzuna returns an HTML error page when the daily free-tier cap is hit.
    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      const note = route === 'adzuna' ? 'quota reached or non-JSON response' : 'non-JSON upstream'
      return json({ error: note, results: [], count: 0 }, 200, origin)
    }

    // Stream the JSON back with CORS headers attached.
    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
    })
  },
}