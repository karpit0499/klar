// ============================================================================
// URL helpers for the fabric. Connectors declare a full URL in config; the
// proxy call needs it split into { host, path } so the Worker can validate the
// host against its allowlist and reconstruct the request itself (§7).
// ============================================================================

export function hostAndPath(rawUrl: string): { host: string; path: string } {
  const url = new URL(rawUrl)
  return { host: url.host, path: url.pathname + url.search }
}

/** Resolve a possibly-relative apply URL against an absolute base. */
export function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

/** Append/replace query params on a path (keeps the leading slash). */
export function withParams(path: string, params: Record<string, string | number | undefined>): string {
  const [base, existing = ''] = path.split('?')
  const search = new URLSearchParams(existing)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${base}?${query}` : base
}