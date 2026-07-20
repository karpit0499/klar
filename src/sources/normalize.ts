// ============================================================================
// Shared helpers every adapter uses to fill the NormalizedJob contract.
// ============================================================================
import type { NormalizedJob, SourceId } from '../types'
import { stableHash } from '../lib/hash'

/** Build the stable dedup id from source + the source's own id. */
export function buildId(source: SourceId, sourceId: string): string {
  return stableHash(`${source}:${sourceId}`)
}

/** Best-effort convert various date encodings to an ISO 8601 string. */
export function toISO(input: unknown): string | undefined {
  if (input == null || input === '') return undefined
  // Unix seconds (10 digits) or milliseconds (13 digits)
  if (typeof input === 'number') {
    const ms = input < 1e12 ? input * 1000 : input
    const d = new Date(ms)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  if (typeof input === 'string') {
    // Pure YYYY-MM-DD or full ISO both parse fine
    const d = new Date(input)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

/** Treat BA's literal "null" strings and empty values as absent. */
export function clean(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  const t = s.trim()
  return t && t.toLowerCase() !== 'null' ? t : undefined
}

/** Heuristic remote detection from free text when a source has no flag. */
export function looksRemote(...parts: (string | undefined)[]): boolean {
  const hay = parts.filter(Boolean).join(' ').toLowerCase()
  return /\bremote\b|home\s*office|homeoffice|\bwork from home\b|\bwfh\b/.test(hay)
}

/** Assemble a NormalizedJob, filling required defaults so callers stay terse. */
export function makeJob(
  partial: Omit<NormalizedJob, 'id' | 'fetched_at' | 'tags' | 'salary' | 'location'> & {
    tags?: string[]
    salary?: NormalizedJob['salary']
    location: NormalizedJob['location']
  },
): NormalizedJob {
  return {
    tags: [],
    salary: {},
    ...partial,
    id: buildId(partial.source, partial.source_id),
    fetched_at: new Date().toISOString(),
  }
}