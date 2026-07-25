// ============================================================================
// Best-effort city detection for connectors whose payload does not carry a
// clean city field (many employer feeds are national). We match the requested
// cities against the item text; an unmatched item keeps `city: undefined` and
// is reported as "could not be distance-checked" rather than being dropped.
// ============================================================================
import { normalizeKey } from '../../lib/hash'
import type { FlexibleQuery } from './types'

/** Return the requested city named in `text`, or undefined. */
export function detectCity(text: string, query: FlexibleQuery): string | undefined {
  const haystack = ` ${normalizeKey(text)} `
  for (const { city } of query.cities) {
    const needle = normalizeKey(city)
    if (needle && haystack.includes(` ${needle} `)) return city
  }
  return undefined
}

/** True when the query has no cities (national search) or the text names one. */
export function cityAllowed(text: string, query: FlexibleQuery): boolean {
  if (query.cities.length === 0) return true
  return detectCity(text, query) !== undefined
}