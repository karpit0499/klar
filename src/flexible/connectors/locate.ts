// ============================================================================
// Best-effort city detection for connectors whose payload does not carry a
// clean city field (many employer feeds are national). We match the requested
// cities against the item text; an unmatched item keeps `city: undefined` and
// is reported as "could not be distance-checked" rather than being dropped.
// ============================================================================
import { germanKeyVariants } from '../../lib/hash'
import type { FlexibleQuery } from './types'

/** Return the requested city named in `text`, or undefined. */
export function detectCity(text: string, query: FlexibleQuery): string | undefined {
  const haystacks = germanKeyVariants(text).map((value) => ` ${value} `)
  for (const { city } of query.cities) {
    const needles = germanKeyVariants(city)
    if (needles.some((needle) => haystacks.some((haystack) => haystack.includes(` ${needle} `)))) {
      return city
    }
  }
  return undefined
}

/** True when the query has no cities (national search) or the text names one. */
export function cityAllowed(text: string, query: FlexibleQuery): boolean {
  if (query.cities.length === 0) return true
  return detectCity(text, query) !== undefined
}
