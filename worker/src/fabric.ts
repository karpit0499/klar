// ============================================================================
// The Source-Fabric retrieval endpoint (roadmap §7). This is an ALLOWLISTED
// retrieval service, never an open proxy. The client asks for {host, path};
// the Worker refuses anything whose host is not on the fixed allowlist, rebuilds
// the URL itself (never trusting a caller-supplied absolute URL), allows only
// GET, follows redirects manually while re-validating every hop, blocks private
// networks, caps bytes, checks content types, strips XML DOCTYPE/ENTITY
// declarations (anti-XXE), and returns a JSON envelope { status, contentType,
// body }. It never executes source JavaScript.
//
// Keep FABRIC_HOSTS in sync with src/flexible/connectors/registry.de.ts
// (FABRIC_ALLOWED_HOSTS). A test asserts the registry's hosts are a subset.
// ============================================================================

/** host → allowed path prefixes. '/' approves the whole host. */
export const FABRIC_HOSTS: Record<string, string[]> = {
  'rest.arbeitsagentur.de': ['/jobboerse'],
  'api.adzuna.com': ['/v1/api'],
  'www.arbeitnow.com': ['/api'],
  'api.ashbyhq.com': ['/posting-api'],
  'jobs.rewe-group.com': ['/'],
  'jobs.kaufland.com': ['/'],
  'jobs.lidl.de': ['/'],
  'jobs.aldi-sued.de': ['/'],
  'karriere.aldi-nord.de': ['/'],
  'jobs.netto-online.de': ['/'],
  'jobs.dm.de': ['/'],
  'karriere.rossmann.de': ['/'],
  'jobs.ikea.com': ['/'],
  'karriere.edeka.de': ['/'],
  'careers.dhl.com': ['/'],
  'hiring.amazon.de': ['/'],
  'careers.hermesworld.com': ['/'],
  'careers.goflink.com': ['/'],
  'karriere.lieferando.de': ['/'],
  'wolt.com': ['/'],
  'mcdonalds.jobs': ['/'],
  'bkkarriere.de': ['/'],
  'careers.amrest.eu': ['/'],
  'karriere.nordsee.com': ['/'],
}

export const MAX_QUERY_LENGTH = 2_048
export const MAX_REDIRECTS = 3
export const DEFAULT_MAX_BYTES = 2_000_000

const CONTENT_TYPES: Record<'json' | 'xml' | 'text', string[]> = {
  json: ['application/json', 'text/json', 'application/ld+json'],
  xml: ['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'],
  text: ['text/html', 'application/xhtml+xml', 'text/plain'],
}

/** Reject loopback/private/link-local hosts (defense in depth for redirects). */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10 || a === 127) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 169 && b === 254) return true // link-local
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }
  return false
}

/** True when {host, path} is on the fixed allowlist and not a blocked network. */
export function isAllowedTarget(host: string, path: string): boolean {
  if (isBlockedHost(host)) return false
  const prefixes = FABRIC_HOSTS[host.toLowerCase()]
  if (!prefixes) return false
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return prefixes.some((prefix) => prefix === '/' || cleanPath.startsWith(prefix))
}

/** Strip DOCTYPE/ENTITY declarations before any XML reaches the client. */
export function hardenXml(text: string): string {
  return text
    .replace(/<!DOCTYPE[^>]*(\[[^\]]*\])?[^>]*>/gi, '')
    .replace(/<!ENTITY[^>]*>/gi, '')
}

export type FabricEnvelope = { status: number; contentType: string; body: string }
export type FabricFailure = { error: Record<string, unknown>; httpStatus: number }

function failure(
  category: string,
  message: string,
  httpStatus: number,
  technical: string,
): FabricFailure {
  return {
    httpStatus,
    error: {
      category,
      message,
      dataSafe: true,
      available: 'Baseline job sources and saved local data remain available.',
      action: { label: 'Retry', kind: 'retry' },
      technical,
    },
  }
}

/** Perform one allowlisted retrieval with manual, re-validated redirects. */
export async function fabricFetch(
  input: { host: string; path: string; accept: 'json' | 'xml' | 'text'; maxBytes: number },
): Promise<FabricEnvelope | FabricFailure> {
  if (!input.host || !input.path) return failure('validation', 'Missing host or path.', 400, 'missing_target')
  if (input.path.length > MAX_QUERY_LENGTH) return failure('validation', 'Query too long.', 414, 'path_too_long')
  if (!isAllowedTarget(input.host, input.path)) {
    return failure('validation', 'This source host is not on the allowlist.', 403, `blocked_host:${input.host}`)
  }

  let currentHost = input.host
  let currentPath = input.path.startsWith('/') ? input.path : `/${input.path}`

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = `https://${currentHost}${currentPath}`
    let res: Response
    try {
      res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { Accept: acceptHeader(input.accept) } })
    } catch (error) {
      return failure('network', 'The source could not be reached.', 502, error instanceof Error ? error.message : 'fetch_failed')
    }

    // Manual redirect handling — validate every hop against the allowlist.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return failure('source', 'Redirect without a location.', 502, 'redirect_no_location')
      let next: URL
      try {
        next = new URL(location, url)
      } catch {
        return failure('source', 'Invalid redirect target.', 502, 'redirect_bad_url')
      }
      if (next.protocol !== 'https:' || !isAllowedTarget(next.host, next.pathname + next.search)) {
        return failure('validation', 'Redirect left the allowlist.', 403, `blocked_redirect:${next.host}`)
      }
      currentHost = next.host
      currentPath = next.pathname + next.search
      continue
    }

    if (res.status === 429) return failure('rate_limit', 'The source is rate limited.', 429, 'upstream_429')
    if (res.status >= 400) return failure('source', 'The source returned an error.', 502, `upstream_${res.status}`)

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!CONTENT_TYPES[input.accept].some((allowed) => contentType.includes(allowed))) {
      return failure('source', 'Unexpected content type from source.', 502, `bad_content_type:${contentType || 'none'}`)
    }
    const declaredLength = Number(res.headers.get('content-length') ?? '0')
    const maxBytes = input.maxBytes > 0 ? Math.min(input.maxBytes, DEFAULT_MAX_BYTES) : DEFAULT_MAX_BYTES
    if (declaredLength && declaredLength > maxBytes) {
      return failure('source', 'Source response too large.', 413, `too_large:${declaredLength}`)
    }

    let body = await res.text()
    if (body.length > maxBytes) body = body.slice(0, maxBytes)
    if (input.accept !== 'json') body = hardenXml(body)

    return { status: res.status, contentType, body }
  }

  return failure('source', 'Too many redirects.', 502, 'redirect_loop')
}

function acceptHeader(accept: 'json' | 'xml' | 'text'): string {
  if (accept === 'json') return 'application/json'
  if (accept === 'xml') return 'application/rss+xml, application/xml;q=0.9, */*;q=0.1'
  return 'text/html, application/xhtml+xml'
}

export function isFabricFailure(value: FabricEnvelope | FabricFailure): value is FabricFailure {
  return (value as FabricFailure).error !== undefined
}