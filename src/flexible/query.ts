// ============================================================================
// Build the normalized FlexibleQuery the fabric runs, and a stable cache key.
// The résumé is never consulted — Flexible Work is résumé-free by design.
// ============================================================================
import type { FlexibleWorkPreferences } from '../types'
import { stableHash } from '../lib/hash'
import type { FlexibleQuery } from './connectors/types'

export function toFlexibleQuery(
  prefs: FlexibleWorkPreferences,
  opts: { page?: number; keywords?: string[]; language?: 'de' | 'en' } = {},
): FlexibleQuery {
  return {
    cities: prefs.locations.map((l) => ({ city: l.city, radius_km: l.radius_km })),
    employment: [...prefs.employment],
    roleFamilies: [...prefs.roleFamilies],
    workplaces: [...prefs.workplaces],
    keywords: opts.keywords ?? [],
    page: opts.page,
    language: opts.language,
  }
}

/** Signature of a query's filters (page-independent) — the cache & session key. */
export function flexibleQueryKey(query: FlexibleQuery): string {
  return `flex:${stableHash(
    JSON.stringify({
      c: query.cities.map((c) => `${c.city.toLowerCase()}@${c.radius_km}`).sort(),
      e: [...query.employment].sort(),
      r: [...query.roleFamilies].sort(),
      w: [...query.workplaces].sort(),
      k: [...query.keywords].map((k) => k.toLowerCase()).sort(),
    }),
  )}`
}